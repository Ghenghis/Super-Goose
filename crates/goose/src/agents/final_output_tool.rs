use crate::agents::tool_execution::ToolCallResult;
use crate::recipe::Response;
use indoc::formatdoc;
use regex::Regex;
use rmcp::model::{CallToolRequestParams, Content, ErrorCode, ErrorData, Tool, ToolAnnotations};
use serde_json::Value;
use std::borrow::Cow;
use std::fmt;

pub const FINAL_OUTPUT_TOOL_NAME: &str = "recipe__final_output";
pub const FINAL_OUTPUT_CONTINUATION_MESSAGE: &str =
    "You MUST call the `final_output` tool NOW with the final output for the user.";

/// Default maximum number of validation retries before accepting output with a warning.
const DEFAULT_MAX_RETRIES: u32 = 3;

// ---------------------------------------------------------------------------
// Validation mode
// ---------------------------------------------------------------------------

/// Defines how the FinalOutputTool validates LLM output.
#[derive(Debug, Clone)]
pub enum ValidationMode {
    /// Validate output against a JSON Schema (the original/default behavior).
    JsonSchema,

    /// Validate that specific fields exist and have the expected JSON types.
    /// Each entry maps a JSON-pointer field path (e.g. "/user/name") to an
    /// expected JSON type name ("string", "number", "boolean", "array", "object", "null").
    TypedFields(Vec<TypedFieldRule>),

    /// Validate that the *serialized* JSON output matches a regex pattern.
    RegexPattern(String),
}

/// A single typed-field validation rule.
#[derive(Debug, Clone)]
pub struct TypedFieldRule {
    /// JSON pointer path, e.g. "/user/name" or "/tags".
    pub path: String,
    /// Expected JSON type: "string", "number", "boolean", "array", "object", "null".
    pub expected_type: String,
    /// Whether this field is required (must be present).
    pub required: bool,
}

impl TypedFieldRule {
    pub fn new(path: impl Into<String>, expected_type: impl Into<String>, required: bool) -> Self {
        Self {
            path: path.into(),
            expected_type: expected_type.into(),
            required,
        }
    }
}

// ---------------------------------------------------------------------------
// Output transformation
// ---------------------------------------------------------------------------

/// Optional post-validation transformation to apply to accepted output.
#[derive(Debug, Clone)]
pub enum OutputTransform {
    /// No transformation -- pass through as-is.
    None,
    /// Extract a single field by JSON pointer and return its value.
    ExtractField(String),
    /// Extract multiple fields and return them as a new JSON object.
    ExtractFields(Vec<String>),
    /// Format the entire output as pretty-printed JSON (useful for readability).
    PrettyPrint,
}

// ---------------------------------------------------------------------------
// Validation history
// ---------------------------------------------------------------------------

/// A record of one validation attempt, kept for debugging purposes.
#[derive(Debug, Clone)]
pub struct ValidationAttempt {
    /// 1-based attempt number.
    pub attempt: u32,
    /// Whether validation succeeded.
    pub success: bool,
    /// The error message, if validation failed.
    pub error: Option<String>,
    /// A compact summary of what the LLM submitted (first 200 chars of serialized JSON).
    pub input_summary: String,
}

impl fmt::Display for ValidationAttempt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let status = if self.success { "OK" } else { "FAIL" };
        write!(
            f,
            "Attempt #{} [{}]: {}",
            self.attempt,
            status,
            self.error.as_deref().unwrap_or("passed")
        )
    }
}

// ---------------------------------------------------------------------------
// FinalOutputTool
// ---------------------------------------------------------------------------

pub struct FinalOutputTool {
    pub response: Response,
    /// The final output collected for the user. Single-line JSON string for easy extraction.
    pub final_output: Option<String>,

    // --- Enhanced fields ---
    /// Which validation strategy to use. Defaults to `JsonSchema`.
    validation_mode: ValidationMode,
    /// Optional transformation applied after successful validation.
    output_transform: OutputTransform,
    /// Maximum validation attempts before accepting with a warning. 0 means unlimited.
    max_retries: u32,
    /// Running count of validation attempts (resets when final_output is cleared).
    retry_count: u32,
    /// History of all validation attempts for debugging.
    validation_history: Vec<ValidationAttempt>,
    /// Whether the output was accepted despite validation failure (retry budget exhausted).
    accepted_with_warning: bool,
}

impl FinalOutputTool {
    /// Create a new FinalOutputTool with the default `JsonSchema` validation mode.
    ///
    /// This is the original constructor -- fully backward-compatible.
    pub fn new(response: Response) -> Self {
        if response.json_schema.is_none() {
            panic!("Cannot create FinalOutputTool: json_schema is required");
        }
        let schema = response.json_schema.as_ref().unwrap();

        if let Some(obj) = schema.as_object() {
            if obj.is_empty() {
                panic!("Cannot create FinalOutputTool: empty json_schema is not allowed");
            }
        }

        jsonschema::meta::validate(schema).unwrap();
        Self {
            response,
            final_output: None,
            validation_mode: ValidationMode::JsonSchema,
            output_transform: OutputTransform::None,
            max_retries: DEFAULT_MAX_RETRIES,
            retry_count: 0,
            validation_history: Vec::new(),
            accepted_with_warning: false,
        }
    }

    // -- Builder-style setters --------------------------------------------------

    /// Set the validation mode.
    pub fn with_validation_mode(mut self, mode: ValidationMode) -> Self {
        self.validation_mode = mode;
        self
    }

    /// Set the output transformation.
    pub fn with_output_transform(mut self, transform: OutputTransform) -> Self {
        self.output_transform = transform;
        self
    }

    /// Set the maximum number of retries (0 = unlimited).
    pub fn with_max_retries(mut self, max: u32) -> Self {
        self.max_retries = max;
        self
    }

    // -- Accessors --------------------------------------------------------------

    /// Number of validation attempts so far.
    pub fn retry_count(&self) -> u32 {
        self.retry_count
    }

    /// Maximum retries configured.
    pub fn max_retries(&self) -> u32 {
        self.max_retries
    }

    /// Whether the last accepted output was accepted despite validation failure.
    pub fn was_accepted_with_warning(&self) -> bool {
        self.accepted_with_warning
    }

    /// Read-only access to the validation history.
    pub fn validation_history(&self) -> &[ValidationAttempt] {
        &self.validation_history
    }

    /// Reset retry state. Called by the retry system when the full agent loop restarts.
    pub fn reset_retry_state(&mut self) {
        self.retry_count = 0;
        self.validation_history.clear();
        self.accepted_with_warning = false;
        self.final_output = None;
    }

    // -- Tool descriptor --------------------------------------------------------

    pub fn tool(&self) -> Tool {
        let instructions = formatdoc! {r#"
            The final_output tool collects the final output for the user and provides validation for structured JSON final output against a predefined schema.

            This final_output tool MUST be called with the final output for the user.

            Purpose:
            - Collects the final output for the user
            - Ensures that final outputs conform to the expected JSON structure
            - Provides clear validation feedback when outputs don't match the schema

            Usage:
            - Call the `final_output` tool with your JSON final output passed as the argument.

            The expected JSON schema format is:

            {}

            When validation fails, you'll receive:
            - Specific validation errors identifying the exact field and problem
            - The expected format with type information
            - A retry counter showing how many attempts remain
            - Actionable guidance on how to fix each error
        "#, serde_json::to_string_pretty(self.response.json_schema.as_ref().unwrap()).unwrap()};

        Tool::new(
            FINAL_OUTPUT_TOOL_NAME.to_string(),
            instructions,
            self.response
                .json_schema
                .as_ref()
                .unwrap()
                .as_object()
                .unwrap()
                .clone(),
        )
        .annotate(ToolAnnotations {
            title: Some("Final Output".to_string()),
            read_only_hint: Some(false),
            destructive_hint: Some(false),
            idempotent_hint: Some(true),
            open_world_hint: Some(false),
        })
    }

    pub fn system_prompt(&self) -> String {
        formatdoc! {r#"
            # Final Output Instructions

            You MUST use the `final_output` tool to collect the final output for the user rather than providing the output directly in your response.
            The final output MUST be a valid JSON object that is provided to the `final_output` tool when called and it must match the following schema:

            {}

            ----
        "#, serde_json::to_string_pretty(self.response.json_schema.as_ref().unwrap()).unwrap()}
    }

    // -- Validation dispatch ----------------------------------------------------

    /// Validate output according to the current validation mode.
    async fn validate_output(&self, output: &Value) -> Result<Value, String> {
        match &self.validation_mode {
            ValidationMode::JsonSchema => self.validate_json_schema(output).await,
            ValidationMode::TypedFields(rules) => {
                Self::validate_typed_fields(output, rules)
            }
            ValidationMode::RegexPattern(pattern) => {
                Self::validate_regex_pattern(output, pattern)
            }
        }
    }

    // -- JsonSchema validation --------------------------------------------------

    async fn validate_json_schema(&self, output: &Value) -> Result<Value, String> {
        let compiled_schema =
            match jsonschema::validator_for(self.response.json_schema.as_ref().unwrap()) {
                Ok(schema) => schema,
                Err(e) => {
                    return Err(format!("Internal error: Failed to compile schema: {}", e));
                }
            };

        let validation_errors: Vec<String> = compiled_schema
            .iter_errors(output)
            .map(|error| {
                let path_str = error.instance_path.to_string();
                let path = if path_str.is_empty() {
                    "(root)".to_string()
                } else {
                    path_str.clone()
                };
                let pointer = if path_str.is_empty() {
                    None
                } else {
                    Some(path_str.as_str())
                };
                format_schema_error(&path, &error.to_string(), output, pointer)
            })
            .collect();

        if validation_errors.is_empty() {
            Ok(output.clone())
        } else {
            let schema_pretty = serde_json::to_string_pretty(
                self.response.json_schema.as_ref().unwrap(),
            )
            .unwrap_or_else(|_| "Invalid schema".to_string());

            Err(formatdoc! {r#"
                Output validation failed with {error_count} error(s):

                {errors}

                EXPECTED JSON SCHEMA:
                {schema}

                HOW TO FIX:
                - Read each error above carefully.
                - Ensure every required field is present with the correct type.
                - Re-call the `final_output` tool with the corrected JSON."#,
                error_count = validation_errors.len(),
                errors = validation_errors.join("\n"),
                schema = schema_pretty
            })
        }
    }

    // -- TypedFields validation -------------------------------------------------

    fn validate_typed_fields(output: &Value, rules: &[TypedFieldRule]) -> Result<Value, String> {
        let mut errors: Vec<String> = Vec::new();

        for rule in rules {
            let value = output.pointer(&rule.path);
            match value {
                None if rule.required => {
                    errors.push(format!(
                        "  - MISSING REQUIRED FIELD \"{path}\": \
                         Add a field at JSON pointer \"{path}\" with type \"{expected}\".",
                        path = rule.path,
                        expected = rule.expected_type,
                    ));
                }
                None => {
                    // Optional field absent -- OK.
                }
                Some(val) => {
                    let actual = json_type_name(val);
                    if actual != rule.expected_type {
                        errors.push(format!(
                            "  - WRONG TYPE at \"{path}\": expected \"{expected}\" but got \"{actual}\". \
                             Change the value to be a valid {expected}.",
                            path = rule.path,
                            expected = rule.expected_type,
                            actual = actual,
                        ));
                    }
                }
            }
        }

        if errors.is_empty() {
            Ok(output.clone())
        } else {
            Err(formatdoc! {r#"
                Typed field validation failed with {count} error(s):

                {errors}

                HOW TO FIX:
                - Ensure each listed field exists at the specified path with the correct type.
                - Re-call the `final_output` tool with the corrected JSON."#,
                count = errors.len(),
                errors = errors.join("\n"),
            })
        }
    }

    // -- RegexPattern validation ------------------------------------------------

    fn validate_regex_pattern(output: &Value, pattern: &str) -> Result<Value, String> {
        let serialized = serde_json::to_string(output).unwrap_or_default();

        let re = match Regex::new(pattern) {
            Ok(r) => r,
            Err(e) => {
                return Err(format!(
                    "Internal error: invalid regex pattern \"{}\": {}",
                    pattern, e
                ));
            }
        };

        if re.is_match(&serialized) {
            Ok(output.clone())
        } else {
            Err(formatdoc! {r#"
                Regex pattern validation failed.

                Your serialized output did not match the required pattern:
                  Pattern: {pattern}

                Your output (serialized):
                  {serialized}

                HOW TO FIX:
                - Adjust the JSON values so that the serialized form matches the pattern above.
                - Re-call the `final_output` tool with the corrected JSON."#,
                pattern = pattern,
                serialized = truncate_str(&serialized, 500),
            })
        }
    }

    // -- Output transformation --------------------------------------------------

    fn apply_transform(&self, output: &Value) -> Value {
        match &self.output_transform {
            OutputTransform::None => output.clone(),
            OutputTransform::ExtractField(pointer) => {
                output.pointer(pointer).cloned().unwrap_or(Value::Null)
            }
            OutputTransform::ExtractFields(pointers) => {
                let mut obj = serde_json::Map::new();
                for pointer in pointers {
                    // Use the last segment of the pointer as the key.
                    let key = pointer
                        .rsplit('/')
                        .next()
                        .unwrap_or(pointer)
                        .to_string();
                    if let Some(val) = output.pointer(pointer) {
                        obj.insert(key, val.clone());
                    }
                }
                Value::Object(obj)
            }
            OutputTransform::PrettyPrint => output.clone(), // pretty-printing handled in serialization
        }
    }

    // -- Main execution entry point ---------------------------------------------

    pub async fn execute_tool_call(&mut self, tool_call: CallToolRequestParams) -> ToolCallResult {
        match tool_call.name.to_string().as_str() {
            FINAL_OUTPUT_TOOL_NAME => {
                let input_value: Value = match tool_call.arguments {
                    Some(map) => Value::Object(map),
                    None => Value::Null,
                };
                self.retry_count += 1;

                let input_summary = truncate_str(
                    &serde_json::to_string(&input_value).unwrap_or_default(),
                    200,
                );

                let result = self.validate_output(&input_value).await;

                match result {
                    Ok(validated) => {
                        self.validation_history.push(ValidationAttempt {
                            attempt: self.retry_count,
                            success: true,
                            error: None,
                            input_summary,
                        });
                        self.accepted_with_warning = false;

                        let transformed = self.apply_transform(&validated);
                        self.final_output = Some(Self::parsed_final_output_string(transformed));
                        ToolCallResult::from(Ok(rmcp::model::CallToolResult {
                            content: vec![Content::text(
                                "Final output successfully collected.".to_string(),
                            )],
                            structured_content: None,
                            is_error: Some(false),
                            meta: None,
                        }))
                    }
                    Err(error) => {
                        self.validation_history.push(ValidationAttempt {
                            attempt: self.retry_count,
                            success: false,
                            error: Some(error.clone()),
                            input_summary: input_summary.clone(),
                        });

                        // Check if retry budget is exhausted.
                        if self.max_retries > 0 && self.retry_count >= self.max_retries {
                            // Accept the output despite validation failure.
                            self.accepted_with_warning = true;
                            let transformed = self.apply_transform(&input_value);
                            self.final_output =
                                Some(Self::parsed_final_output_string(transformed));

                            ToolCallResult::from(Ok(rmcp::model::CallToolResult {
                                content: vec![Content::text(format!(
                                    "WARNING: Output accepted after {} failed validation attempt(s). \
                                     The output may not conform to the expected schema. \
                                     Last validation error: {}",
                                    self.retry_count,
                                    truncate_str(&error, 300),
                                ))],
                                structured_content: None,
                                is_error: Some(false),
                                meta: None,
                            }))
                        } else {
                            let remaining = if self.max_retries > 0 {
                                self.max_retries - self.retry_count
                            } else {
                                u32::MAX
                            };

                            let retry_guidance = if self.max_retries > 0 {
                                format!(
                                    "\n\nRETRY STATUS: Attempt {current} of {max}. \
                                     You have {remaining} attempt(s) remaining before the output \
                                     is accepted as-is.",
                                    current = self.retry_count,
                                    max = self.max_retries,
                                    remaining = remaining,
                                )
                            } else {
                                format!(
                                    "\n\nRETRY STATUS: Attempt {current} (no limit).",
                                    current = self.retry_count,
                                )
                            };

                            let full_error = format!("{}{}", error, retry_guidance);

                            ToolCallResult::from(Err(ErrorData {
                                code: ErrorCode::INVALID_PARAMS,
                                message: Cow::from(full_error),
                                data: None,
                            }))
                        }
                    }
                }
            }
            _ => ToolCallResult::from(Err(ErrorData {
                code: ErrorCode::INVALID_REQUEST,
                message: Cow::from(format!("Unknown tool: {}", tool_call.name)),
                data: None,
            })),
        }
    }

    /// Formats the parsed JSON as a single line string for easy extraction from output.
    fn parsed_final_output_string(parsed_json: Value) -> String {
        serde_json::to_string(&parsed_json).unwrap()
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/// Return a human-readable JSON type name for a serde_json::Value.
fn json_type_name(val: &Value) -> &'static str {
    match val {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// Truncate a string to at most `max_len` characters, appending "..." if truncated.
fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

/// Build a detailed, actionable error message for a single JSON-schema validation error.
fn format_schema_error(
    path: &str,
    error_msg: &str,
    output: &Value,
    pointer: Option<&str>,
) -> String {
    // Try to determine what the LLM actually provided at this path.
    let actual_value = match pointer {
        None => Some(output),
        Some(p) => output.pointer(p),
    };

    let actual_desc = match actual_value {
        Some(val) => format!(" (you provided: {} of type \"{}\")", truncate_str(&val.to_string(), 60), json_type_name(val)),
        None => " (field is missing)".to_string(),
    };

    // Determine a concise fix suggestion based on common error patterns.
    let fix_hint = if error_msg.contains("is a required property") || error_msg.contains("required") {
        let field_name = extract_required_field_name(error_msg);
        format!("Add the missing required field \"{}\" with the correct type.", field_name)
    } else if error_msg.contains("is not of type") {
        format!("Change the value at \"{}\" to the correct type.", path)
    } else if error_msg.contains("is not valid under any of the given schemas") {
        format!("The value at \"{}\" does not match any of the allowed schemas. Check the schema for valid options.", path)
    } else if error_msg.contains("Additional properties are not allowed") {
        format!("Remove the unexpected property at \"{}\".", path)
    } else if error_msg.contains("is less than the minimum") || error_msg.contains("is greater than the maximum") {
        format!("Adjust the numeric value at \"{}\" to be within the allowed range.", path)
    } else if error_msg.contains("does not match") {
        format!("The string at \"{}\" does not match the required pattern. Check the pattern in the schema.", path)
    } else {
        format!("Fix the value at \"{}\" according to the schema.", path)
    };

    format!(
        "  - ERROR at \"{path}\": {msg}{actual}\n    FIX: {fix}",
        path = path,
        msg = error_msg,
        actual = actual_desc,
        fix = fix_hint,
    )
}

/// Try to extract the field name from a "is a required property" error message.
fn extract_required_field_name(error_msg: &str) -> String {
    // jsonschema errors look like: "'fieldname' is a required property"
    if let Some(start) = error_msg.find('\'') {
        if let Some(end) = error_msg[start + 1..].find('\'') {
            return error_msg[start + 1..start + 1 + end].to_string();
        }
    }
    "unknown".to_string()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recipe::Response;
    use rmcp::model::CallToolRequestParams;
    use rmcp::object;
    use serde_json::json;

    // -- Helpers ---------------------------------------------------------------

    fn simple_schema() -> Value {
        json!({
            "type": "object",
            "properties": {
                "message": {"type": "string"},
                "count": {"type": "number"}
            },
            "required": ["message", "count"]
        })
    }

    fn complex_schema() -> Value {
        json!({
            "type": "object",
            "properties": {
                "user": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "age": {"type": "number"}
                    },
                    "required": ["name", "age"]
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["user", "tags"]
        })
    }

    fn make_tool(schema: Value) -> FinalOutputTool {
        FinalOutputTool::new(Response {
            json_schema: Some(schema),
        })
    }

    fn make_call(args: serde_json::Map<String, Value>) -> CallToolRequestParams {
        CallToolRequestParams {
            meta: None,
            task: None,
            name: FINAL_OUTPUT_TOOL_NAME.into(),
            arguments: Some(args),
        }
    }

    // -- Construction tests ----------------------------------------------------

    #[test]
    #[should_panic(expected = "Cannot create FinalOutputTool: json_schema is required")]
    fn test_new_with_missing_schema() {
        let response = Response { json_schema: None };
        FinalOutputTool::new(response);
    }

    #[test]
    #[should_panic(expected = "Cannot create FinalOutputTool: empty json_schema is not allowed")]
    fn test_new_with_empty_schema() {
        let response = Response {
            json_schema: Some(json!({})),
        };
        FinalOutputTool::new(response);
    }

    #[test]
    #[should_panic]
    fn test_new_with_invalid_schema() {
        let response = Response {
            json_schema: Some(json!({
                "type": "invalid_type",
                "properties": {
                    "message": {
                        "type": "unknown_type"
                    }
                }
            })),
        };
        FinalOutputTool::new(response);
    }

    #[test]
    fn test_new_defaults() {
        let tool = make_tool(simple_schema());
        assert_eq!(tool.retry_count(), 0);
        assert_eq!(tool.max_retries(), DEFAULT_MAX_RETRIES);
        assert!(!tool.was_accepted_with_warning());
        assert!(tool.validation_history().is_empty());
        assert!(tool.final_output.is_none());
    }

    #[test]
    fn test_builder_methods() {
        let tool = make_tool(simple_schema())
            .with_max_retries(5)
            .with_validation_mode(ValidationMode::JsonSchema)
            .with_output_transform(OutputTransform::PrettyPrint);
        assert_eq!(tool.max_retries(), 5);
    }

    // -- JsonSchema validation tests -------------------------------------------

    #[tokio::test]
    async fn test_json_schema_valid_output() {
        let mut tool = make_tool(simple_schema());
        let call = make_call(object!({
            "message": "hello",
            "count": 42
        }));

        let result = tool.execute_tool_call(call).await;
        let tool_result = result.result.await;
        assert!(tool_result.is_ok());
        assert!(tool.final_output.is_some());
        assert_eq!(tool.retry_count(), 1);
        assert_eq!(tool.validation_history().len(), 1);
        assert!(tool.validation_history()[0].success);
    }

    #[tokio::test]
    async fn test_json_schema_missing_required_field() {
        let mut tool = make_tool(simple_schema());
        let call = make_call(object!({
            "message": "hello"
            // Missing required "count" field
        }));

        let result = tool.execute_tool_call(call).await;
        let tool_result = result.result.await;
        assert!(tool_result.is_err());
        if let Err(err) = tool_result {
            let msg = err.message.to_string();
            assert!(msg.contains("validation failed"), "Got: {}", msg);
            assert!(msg.contains("RETRY STATUS"), "Missing retry status in: {}", msg);
            assert!(msg.contains("Attempt 1 of 3"), "Missing attempt count in: {}", msg);
        }
        assert!(tool.final_output.is_none());
        assert_eq!(tool.retry_count(), 1);
        assert!(!tool.validation_history()[0].success);
    }

    #[tokio::test]
    async fn test_json_schema_wrong_type() {
        let mut tool = make_tool(simple_schema());
        let call = make_call(object!({
            "message": "hello",
            "count": "not_a_number"
        }));

        let result = tool.execute_tool_call(call).await;
        let tool_result = result.result.await;
        assert!(tool_result.is_err());
        if let Err(err) = tool_result {
            let msg = err.message.to_string();
            assert!(msg.contains("is not of type"), "Got: {}", msg);
            assert!(msg.contains("FIX:"), "Missing fix hint in: {}", msg);
        }
    }

    #[tokio::test]
    async fn test_json_schema_complex_valid() {
        let mut tool = make_tool(complex_schema());
        let call = make_call(object!({
            "user": {
                "name": "John",
                "age": 30
            },
            "tags": ["developer", "rust"]
        }));

        let result = tool.execute_tool_call(call).await;
        let tool_result = result.result.await;
        assert!(tool_result.is_ok());
        assert!(tool.final_output.is_some());

        let output = tool.final_output.as_ref().unwrap();
        assert!(serde_json::from_str::<Value>(output).is_ok());
        assert!(!output.contains('\n'), "Output should be single-line");
    }

    #[tokio::test]
    async fn test_json_schema_complex_invalid_nested() {
        let mut tool = make_tool(complex_schema());
        let call = make_call(object!({
            "user": {
                "name": 123,   // wrong type
                "age": "thirty" // wrong type
            },
            "tags": "not_an_array" // wrong type
        }));

        let result = tool.execute_tool_call(call).await;
        let tool_result = result.result.await;
        assert!(tool_result.is_err());
        if let Err(err) = tool_result {
            let msg = err.message.to_string();
            // Should report multiple errors
            assert!(msg.contains("error(s)"), "Got: {}", msg);
        }
    }

    // -- Retry budget tests ----------------------------------------------------

    #[tokio::test]
    async fn test_retry_budget_exhaustion() {
        let mut tool = make_tool(simple_schema()).with_max_retries(2);

        // Attempt 1 - fails
        let call1 = make_call(object!({"message": "hello"}));
        let r1 = tool.execute_tool_call(call1).await;
        let res1 = r1.result.await;
        assert!(res1.is_err(), "Attempt 1 should fail");
        assert!(tool.final_output.is_none());
        assert_eq!(tool.retry_count(), 1);

        // Attempt 2 - fails again, but budget exhausted => accepted with warning
        let call2 = make_call(object!({"message": "hello"}));
        let r2 = tool.execute_tool_call(call2).await;
        let res2 = r2.result.await;
        assert!(res2.is_ok(), "Attempt 2 should be accepted (budget exhausted)");
        assert!(tool.final_output.is_some(), "Output should be set despite failure");
        assert!(tool.was_accepted_with_warning());
        assert_eq!(tool.retry_count(), 2);

        // Verify the warning message
        if let Ok(call_result) = res2 {
            let text: &str = call_result.content[0].raw.as_text().unwrap().text.as_ref();
            assert!(text.contains("WARNING"), "Got: {}", text);
            assert!(text.contains("2 failed"), "Got: {}", text);
        }
    }

    #[tokio::test]
    async fn test_unlimited_retries() {
        let mut tool = make_tool(simple_schema()).with_max_retries(0);

        // Run several failing attempts -- should never accept
        for i in 0..5 {
            let call = make_call(object!({"message": "hello"}));
            let r = tool.execute_tool_call(call).await;
            let res = r.result.await;
            assert!(res.is_err(), "Attempt {} should fail (unlimited mode)", i + 1);
            assert!(tool.final_output.is_none());
        }

        assert_eq!(tool.retry_count(), 5);
        assert!(!tool.was_accepted_with_warning());
    }

    #[tokio::test]
    async fn test_retry_count_in_error_message() {
        let mut tool = make_tool(simple_schema()).with_max_retries(5);

        let call = make_call(object!({"message": "hello"}));
        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_err());
        if let Err(err) = res {
            let msg = err.message.to_string();
            assert!(msg.contains("Attempt 1 of 5"), "Got: {}", msg);
            assert!(msg.contains("4 attempt(s) remaining"), "Got: {}", msg);
        }
    }

    // -- Validation history tests ----------------------------------------------

    #[tokio::test]
    async fn test_validation_history_tracking() {
        let mut tool = make_tool(simple_schema()).with_max_retries(5);

        // Fail once
        let call1 = make_call(object!({"message": "hello"}));
        let _ = tool.execute_tool_call(call1).await.result.await;

        // Succeed
        let call2 = make_call(object!({"message": "hello", "count": 1}));
        let _ = tool.execute_tool_call(call2).await.result.await;

        assert_eq!(tool.validation_history().len(), 2);
        assert!(!tool.validation_history()[0].success);
        assert!(tool.validation_history()[0].error.is_some());
        assert!(tool.validation_history()[1].success);
        assert!(tool.validation_history()[1].error.is_none());
    }

    #[tokio::test]
    async fn test_reset_retry_state() {
        let mut tool = make_tool(simple_schema());

        // Do a couple attempts
        let call = make_call(object!({"message": "hello"}));
        let _ = tool.execute_tool_call(call).await.result.await;

        assert_eq!(tool.retry_count(), 1);
        assert_eq!(tool.validation_history().len(), 1);

        // Reset
        tool.reset_retry_state();
        assert_eq!(tool.retry_count(), 0);
        assert!(tool.validation_history().is_empty());
        assert!(tool.final_output.is_none());
        assert!(!tool.was_accepted_with_warning());
    }

    // -- TypedFields validation tests ------------------------------------------

    #[tokio::test]
    async fn test_typed_fields_valid() {
        let rules = vec![
            TypedFieldRule::new("/name", "string", true),
            TypedFieldRule::new("/age", "number", true),
            TypedFieldRule::new("/bio", "string", false),
        ];

        let mut tool = make_tool(simple_schema())
            .with_validation_mode(ValidationMode::TypedFields(rules));

        let call = make_call(object!({
            "name": "Alice",
            "age": 30,
            "message": "hi",
            "count": 1
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_ok());
        assert!(tool.final_output.is_some());
    }

    #[tokio::test]
    async fn test_typed_fields_missing_required() {
        let rules = vec![
            TypedFieldRule::new("/name", "string", true),
            TypedFieldRule::new("/age", "number", true),
        ];

        let mut tool = make_tool(simple_schema())
            .with_validation_mode(ValidationMode::TypedFields(rules));

        let call = make_call(object!({
            "name": "Alice",
            "message": "hi",
            "count": 1
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_err());
        if let Err(err) = res {
            let msg = err.message.to_string();
            assert!(msg.contains("MISSING REQUIRED FIELD"), "Got: {}", msg);
            assert!(msg.contains("/age"), "Got: {}", msg);
        }
    }

    #[tokio::test]
    async fn test_typed_fields_wrong_type() {
        let rules = vec![
            TypedFieldRule::new("/name", "string", true),
            TypedFieldRule::new("/age", "number", true),
        ];

        let mut tool = make_tool(simple_schema())
            .with_validation_mode(ValidationMode::TypedFields(rules));

        let call = make_call(object!({
            "name": "Alice",
            "age": "thirty",
            "message": "hi",
            "count": 1
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_err());
        if let Err(err) = res {
            let msg = err.message.to_string();
            assert!(msg.contains("WRONG TYPE"), "Got: {}", msg);
            assert!(msg.contains("/age"), "Got: {}", msg);
            assert!(msg.contains("expected \"number\" but got \"string\""), "Got: {}", msg);
        }
    }

    #[tokio::test]
    async fn test_typed_fields_optional_absent_ok() {
        let rules = vec![
            TypedFieldRule::new("/name", "string", true),
            TypedFieldRule::new("/optional_field", "string", false),
        ];

        let mut tool = make_tool(simple_schema())
            .with_validation_mode(ValidationMode::TypedFields(rules));

        let call = make_call(object!({
            "name": "Alice",
            "message": "hi",
            "count": 1
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_ok());
    }

    // -- RegexPattern validation tests -----------------------------------------

    #[tokio::test]
    async fn test_regex_pattern_valid() {
        let mut tool = make_tool(simple_schema())
            .with_validation_mode(ValidationMode::RegexPattern(r#""message":"[^"]+""#.to_string()));

        let call = make_call(object!({
            "message": "hello world",
            "count": 1
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn test_regex_pattern_invalid() {
        let mut tool = make_tool(simple_schema())
            .with_validation_mode(ValidationMode::RegexPattern(
                r#""status":"success""#.to_string(),
            ));

        let call = make_call(object!({
            "message": "hello",
            "count": 1
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_err());
        if let Err(err) = res {
            let msg = err.message.to_string();
            assert!(msg.contains("Regex pattern validation failed"), "Got: {}", msg);
            assert!(msg.contains("HOW TO FIX"), "Got: {}", msg);
        }
    }

    #[tokio::test]
    async fn test_regex_pattern_bad_regex() {
        let mut tool = make_tool(simple_schema())
            .with_validation_mode(ValidationMode::RegexPattern("[invalid".to_string()));

        let call = make_call(object!({
            "message": "hello",
            "count": 1
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_err());
        if let Err(err) = res {
            let msg = err.message.to_string();
            assert!(msg.contains("Internal error: invalid regex"), "Got: {}", msg);
        }
    }

    // -- Output transformation tests -------------------------------------------

    #[tokio::test]
    async fn test_transform_extract_field() {
        let mut tool = make_tool(simple_schema())
            .with_output_transform(OutputTransform::ExtractField("/message".to_string()));

        let call = make_call(object!({
            "message": "hello world",
            "count": 42
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_ok());

        let output = tool.final_output.as_ref().unwrap();
        let parsed: Value = serde_json::from_str(output).unwrap();
        assert_eq!(parsed, json!("hello world"));
    }

    #[tokio::test]
    async fn test_transform_extract_fields() {
        let mut tool = make_tool(simple_schema())
            .with_output_transform(OutputTransform::ExtractFields(vec![
                "/message".to_string(),
            ]));

        let call = make_call(object!({
            "message": "hello",
            "count": 42
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_ok());

        let output = tool.final_output.as_ref().unwrap();
        let parsed: Value = serde_json::from_str(output).unwrap();
        assert_eq!(parsed, json!({"message": "hello"}));
    }

    #[tokio::test]
    async fn test_transform_none_passthrough() {
        let mut tool = make_tool(simple_schema())
            .with_output_transform(OutputTransform::None);

        let call = make_call(object!({
            "message": "hello",
            "count": 42
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_ok());

        let output = tool.final_output.as_ref().unwrap();
        let parsed: Value = serde_json::from_str(output).unwrap();
        assert_eq!(parsed, json!({"message": "hello", "count": 42}));
    }

    // -- Edge case tests -------------------------------------------------------

    #[tokio::test]
    async fn test_empty_object_input() {
        let mut tool = make_tool(simple_schema());
        let call = make_call(object!({}));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_err());
        if let Err(err) = res {
            let msg = err.message.to_string();
            // Should mention both missing fields
            assert!(msg.contains("required"), "Got: {}", msg);
        }
    }

    #[tokio::test]
    async fn test_unknown_tool_name() {
        let mut tool = make_tool(simple_schema());
        let call = CallToolRequestParams {
            meta: None,
            task: None,
            name: "unknown_tool".into(),
            arguments: Some(object!({})),
        };

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_err());
        if let Err(err) = res {
            assert!(err.message.contains("Unknown tool"), "Got: {}", err.message);
        }
    }

    #[tokio::test]
    async fn test_extra_fields_in_output() {
        // Schema that does NOT use additionalProperties: false, so extra fields are OK
        let schema = json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        });

        let mut tool = make_tool(schema);
        let call = make_call(object!({
            "name": "Alice",
            "extra": "field",
            "another": 123
        }));

        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn test_validation_attempt_display() {
        let attempt = ValidationAttempt {
            attempt: 2,
            success: false,
            error: Some("missing field".to_string()),
            input_summary: "{}".to_string(),
        };
        let display = format!("{}", attempt);
        assert!(display.contains("Attempt #2 [FAIL]"));
        assert!(display.contains("missing field"));

        let success = ValidationAttempt {
            attempt: 1,
            success: true,
            error: None,
            input_summary: "{}".to_string(),
        };
        let display = format!("{}", success);
        assert!(display.contains("Attempt #1 [OK]"));
        assert!(display.contains("passed"));
    }

    // -- Helper function tests -------------------------------------------------

    #[test]
    fn test_json_type_name() {
        assert_eq!(json_type_name(&json!(null)), "null");
        assert_eq!(json_type_name(&json!(true)), "boolean");
        assert_eq!(json_type_name(&json!(42)), "number");
        assert_eq!(json_type_name(&json!("hello")), "string");
        assert_eq!(json_type_name(&json!([1, 2])), "array");
        assert_eq!(json_type_name(&json!({"a": 1})), "object");
    }

    #[test]
    fn test_truncate_str() {
        assert_eq!(truncate_str("hello", 10), "hello");
        assert_eq!(truncate_str("hello world", 5), "hello...");
        assert_eq!(truncate_str("", 5), "");
    }

    #[test]
    fn test_extract_required_field_name() {
        assert_eq!(
            extract_required_field_name("'count' is a required property"),
            "count"
        );
        assert_eq!(
            extract_required_field_name("no quotes here"),
            "unknown"
        );
    }

    // -- Integration: full retry cycle -----------------------------------------

    #[tokio::test]
    async fn test_full_retry_cycle_then_success() {
        let mut tool = make_tool(simple_schema()).with_max_retries(5);

        // Fail twice
        for _ in 0..2 {
            let call = make_call(object!({"message": "hello"}));
            let r = tool.execute_tool_call(call).await;
            let res = r.result.await;
            assert!(res.is_err());
        }

        assert_eq!(tool.retry_count(), 2);
        assert!(tool.final_output.is_none());

        // Now succeed
        let call = make_call(object!({"message": "hello", "count": 99}));
        let r = tool.execute_tool_call(call).await;
        let res = r.result.await;
        assert!(res.is_ok());
        assert!(tool.final_output.is_some());
        assert!(!tool.was_accepted_with_warning());
        assert_eq!(tool.retry_count(), 3);
        assert_eq!(tool.validation_history().len(), 3);
    }

    #[tokio::test]
    async fn test_system_prompt_contains_schema() {
        let tool = make_tool(simple_schema());
        let prompt = tool.system_prompt();
        assert!(prompt.contains("final_output"));
        assert!(prompt.contains("message"));
        assert!(prompt.contains("count"));
    }

    #[tokio::test]
    async fn test_tool_descriptor_has_annotations() {
        let tool = make_tool(simple_schema());
        let descriptor = tool.tool();
        assert_eq!(descriptor.name, FINAL_OUTPUT_TOOL_NAME);
    }
}
