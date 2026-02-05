# Quick GitLab Setup - Opens browser and provides credentials

$GitLabUrl = "http://localhost:8080"
$Username = "root"
$Password = "p/0vhyORgtWQ1ZH4dDpzS1KYuJWSZfNKgjWpmQw6NZ8="

Write-Host "=== GitLab Quick Setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening GitLab in your browser..." -ForegroundColor Yellow
Write-Host ""

# Copy password to clipboard
$Password | Set-Clipboard
Write-Host "Password copied to clipboard!" -ForegroundColor Green
Write-Host ""

# Display credentials
Write-Host "Login Credentials:" -ForegroundColor Yellow
Write-Host "  URL: $GitLabUrl" -ForegroundColor Cyan
Write-Host "  Username: $Username" -ForegroundColor White
Write-Host "  Password: (in clipboard - just paste!)" -ForegroundColor White
Write-Host ""

# Open browser
Start-Process "$GitLabUrl/users/sign_in"

Write-Host "Follow these steps in the browser:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. LOGIN:" -ForegroundColor Yellow
Write-Host "   - Username: root" -ForegroundColor White
Write-Host "   - Password: Ctrl+V to paste from clipboard" -ForegroundColor White
Write-Host "   - Click 'Sign in'" -ForegroundColor White
Write-Host ""

Write-Host "2. CHANGE PASSWORD (recommended):" -ForegroundColor Yellow
Write-Host "   - You'll be prompted to change password" -ForegroundColor White
Write-Host "   - Choose a new password you'll remember" -ForegroundColor White
Write-Host ""

Write-Host "3. CREATE PROJECT:" -ForegroundColor Yellow
Write-Host "   - Click 'New project' (top right)" -ForegroundColor White
Write-Host "   - Click 'Create blank project'" -ForegroundColor White
Write-Host "   - Project name: goose" -ForegroundColor White
Write-Host "   - Visibility: Private" -ForegroundColor White
Write-Host "   - Initialize with README: checked" -ForegroundColor White
Write-Host "   - Click 'Create project'" -ForegroundColor White
Write-Host ""

Write-Host "4. CREATE ACCESS TOKEN (for GitKraken):" -ForegroundColor Yellow
Write-Host "   - Click your avatar (top right)" -ForegroundColor White
Write-Host "   - Preferences > Access Tokens" -ForegroundColor White
Write-Host "   - Name: GitKraken" -ForegroundColor White
Write-Host "   - Scopes: Check api, read_repository, write_repository" -ForegroundColor White
Write-Host "   - Click 'Create personal access token'" -ForegroundColor White
Write-Host "   - COPY THE TOKEN (you can't see it again!)" -ForegroundColor White
Write-Host ""

Write-Host "5. PUSH YOUR CODE:" -ForegroundColor Yellow
Write-Host "   After creating the project, run these commands:" -ForegroundColor Gray
Write-Host ""
Write-Host "   cd C:\Users\Admin\Downloads\projects\goose" -ForegroundColor White
Write-Host "   git remote add gitlab http://localhost:8080/root/goose.git" -ForegroundColor White
Write-Host "   git push gitlab main" -ForegroundColor White
Write-Host ""

Write-Host "Press any key when done with setup..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host ""
Write-Host "Great! Now let's configure the git remote..." -ForegroundColor Green
Write-Host ""

# Add git remote
Push-Location "C:\Users\Admin\Downloads\projects\goose"

$existingRemote = git remote get-url gitlab 2>$null
if ($existingRemote) {
    Write-Host "GitLab remote already exists" -ForegroundColor Gray
} else {
    git remote add gitlab "http://localhost:8080/root/goose.git"
    Write-Host "GitLab remote added!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Git remotes configured:" -ForegroundColor Cyan
git remote -v

Pop-Location

Write-Host ""
Write-Host "Setup complete! You can now:" -ForegroundColor Green
Write-Host "  - Push to GitLab: git push gitlab main" -ForegroundColor White
Write-Host "  - Connect GitKraken with your access token" -ForegroundColor White
Write-Host ""
