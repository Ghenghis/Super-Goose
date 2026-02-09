# XSS (Cross-Site Scripting) Fixes

**Alerts:** #44, #45, #46, #47, #48, #40, #50
**Severity:** Error (Critical)
**Status:** ALL FIXED

---

## Fix #1: script.js - innerHTML to DOM APIs (Alerts 44-47)

**File:** `crates/goose-cli/static/script.js`
**Problem:** Multiple uses of `innerHTML` with template literals to render tool output, even with `escapeHtml()`. CodeQL flags any flow from user data to innerHTML.

**Fix Applied:**
1. **Alert 44 (line 267):** `headerDiv.innerHTML` replaced with `textContent` + `createElement('strong')`
2. **Alert 45 (line 278):** Tool argument rendering switched to DOM API helper functions `createPreCode()` and `createToolParamDiv()`
3. **Alert 46 (line 284):** Text editor path/action display via DOM APIs
4. **Alert 47 (line 346):** Confirmation dialog built entirely with `createElement` calls

**Before:**
```javascript
headerDiv.innerHTML = `<strong>${escapeHtml(data.tool_name)}</strong>`;
contentDiv.innerHTML = `<pre><code>${escapeHtml(data.arguments.command)}</code></pre>`;
```

**After:**
```javascript
const toolStrong = document.createElement('strong');
toolStrong.textContent = data.tool_name;
headerDiv.appendChild(toolStrong);
contentDiv.appendChild(createPreCode(data.arguments.command));
```

---

## Fix #2: mcp_ui_proxy.html - URL Validation (Alerts 48, 40)

**File:** `crates/goose-server/src/routes/templates/mcp_ui_proxy.html`
**Problem:** `sanitizeUrl()` validates the URL, but CodeQL can't trace the data flow through the function. Also, URL redirect without re-validation at point of use.

**Fix Applied:**
- Added re-validation at the point of iframe creation using `new URL()`
- Protocol check (`http:` or `https:`) at the point of use
- Uses `validatedUrl.href` instead of raw string

**Before:**
```javascript
const sanitizedTarget = sanitizeUrl(target);
inner.src = sanitizedTarget;
```

**After:**
```javascript
const sanitizedTarget = sanitizeUrl(target);
const validatedUrl = new URL(sanitizedTarget);
if (validatedUrl.protocol !== 'http:' && validatedUrl.protocol !== 'https:') {
  document.body.textContent = 'Error: invalid URL protocol.';
} else {
  inner.src = validatedUrl.href;
}
```

---

## Fix #3: main.ts - Incomplete Multi-Character Sanitization (Alert 50)

**File:** `ui/desktop/src/main.ts`
**Problem:** The `sanitizeText()` function uses a loop to strip `<[^>]*>` tags, but CodeQL flags that nested/partial tags like `<scr<script>ipt>` could survive.

**Fix Applied:**
- Added a final pass after the loop to remove ALL remaining angle brackets
- `result.replace(/[<>]/g, '')` as a catch-all after tag stripping

**Before:**
```typescript
do {
  previous = result;
  result = result.replace(/<[^>]*>/g, '');
} while (result !== previous);
return result;
```

**After:**
```typescript
do {
  previous = result;
  result = result.replace(/<[^>]*>/g, '');
} while (result !== previous);
result = result.replace(/[<>]/g, '');
return result;
```

---

## Fix #4: escapeHtml Function Upgrade

**File:** `crates/goose-cli/static/script.js`
**Problem:** The DOM-based `escapeHtml()` function (createElement div, set textContent, read innerHTML) is functionally correct but CodeQL can't verify it.

**Fix Applied:**
- Replaced with string-based entity encoding that CodeQL can statically verify
- Covers: `&`, `<`, `>`, `"`, `'`

**Before:**
```javascript
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

**After:**
```javascript
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
```
