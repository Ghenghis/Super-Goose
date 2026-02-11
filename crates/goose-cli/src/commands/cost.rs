use anyhow::Result;

pub async fn handle_cost_status() -> Result<()> {
    println!("Cost Tracking Status");
    println!("====================");
    println!("  Session cost tracking requires an active session.");
    println!("  Start a session with: goose session --budget 5.00");
    println!();
    println!("Budget enforcement is active during sessions.");
    println!("The agent will halt execution when the budget limit is reached.");
    Ok(())
}
