# Automated GitLab Setup Script
# Configures GitLab and creates the goose project

param(
    [string]$RootPassword = "p/0vhyORgtWQ1ZH4dDpzS1KYuJWSZfNKgjWpmQw6NZ8=",
    [string]$NewPassword = ""
)

$GitLabUrl = "http://localhost:8080"
$ProjectName = "goose"

Write-Host "=== GitLab Auto Setup ===" -ForegroundColor Cyan
Write-Host ""

# Function to wait for GitLab to be ready
function Wait-GitLabReady {
    Write-Host "Waiting for GitLab to be fully ready..." -ForegroundColor Yellow
    $maxAttempts = 30
    $attempt = 0

    while ($attempt -lt $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "$GitLabUrl/users/sign_in" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "  GitLab is ready!" -ForegroundColor Green
                return $true
            }
        } catch {
            $attempt++
            Write-Host "  Attempt $attempt/$maxAttempts - GitLab still starting..." -ForegroundColor Gray
            Start-Sleep -Seconds 10
        }
    }

    Write-Host "  GitLab took too long to start. Please try again later." -ForegroundColor Red
    return $false
}

# Wait for GitLab
if (-not (Wait-GitLabReady)) {
    exit 1
}

Write-Host ""
Write-Host "GitLab is ready at: $GitLabUrl" -ForegroundColor Green
Write-Host ""
Write-Host "Root credentials:" -ForegroundColor Yellow
Write-Host "  Username: root" -ForegroundColor White
Write-Host "  Password: $RootPassword" -ForegroundColor White
Write-Host ""

# Create access token via GitLab Rails console
Write-Host "Creating personal access token for CLI/API access..." -ForegroundColor Yellow

$createTokenScript = @"
token = User.find_by_username('root').personal_access_tokens.create(
  scopes: ['api', 'read_repository', 'write_repository', 'read_api', 'write_api'],
  name: 'automation-token',
  expires_at: 365.days.from_now
)
puts token.token
"@

try {
    $token = docker exec gitlab-ce-local gitlab-rails runner "$createTokenScript" 2>$null | Select-Object -Last 1

    if ($token -and $token.Length -gt 10) {
        Write-Host "  Token created: $token" -ForegroundColor Green

        # Save token to file for later use
        $token | Out-File -FilePath "$env:USERPROFILE\.gitlab-token" -Encoding ASCII
        Write-Host "  Token saved to: $env:USERPROFILE\.gitlab-token" -ForegroundColor Gray

        # Create project using API
        Write-Host ""
        Write-Host "Creating 'goose' project..." -ForegroundColor Yellow

        $headers = @{
            "PRIVATE-TOKEN" = $token
            "Content-Type" = "application/json"
        }

        $body = @{
            name = $ProjectName
            description = "Goose - Enterprise AI Agent Platform with LM Studio + Computer Use"
            visibility = "private"
            initialize_with_readme = $true
        } | ConvertTo-Json

        try {
            $project = Invoke-RestMethod -Uri "$GitLabUrl/api/v4/projects" -Method POST -Headers $headers -Body $body

            Write-Host "  Project created successfully!" -ForegroundColor Green
            Write-Host "  Project URL: $GitLabUrl/root/$ProjectName" -ForegroundColor Cyan
            Write-Host "  Git URL: http://localhost:8080/root/$ProjectName.git" -ForegroundColor Cyan

            # Configure git remote
            Write-Host ""
            Write-Host "Adding GitLab remote to local repository..." -ForegroundColor Yellow

            Push-Location "C:\Users\Admin\Downloads\projects\goose"

            # Check if remote already exists
            $existingRemote = git remote get-url gitlab 2>$null

            if ($existingRemote) {
                Write-Host "  GitLab remote already exists, updating..." -ForegroundColor Gray
                git remote set-url gitlab "http://localhost:8080/root/$ProjectName.git"
            } else {
                git remote add gitlab "http://localhost:8080/root/$ProjectName.git"
            }

            Write-Host "  Remote added!" -ForegroundColor Green

            # Show remotes
            Write-Host ""
            Write-Host "Configured remotes:" -ForegroundColor Yellow
            git remote -v | Select-String "gitlab"

            Pop-Location

            Write-Host ""
            Write-Host "=== Setup Complete! ===" -ForegroundColor Green
            Write-Host ""
            Write-Host "Next steps:" -ForegroundColor Cyan
            Write-Host "  1. Open GitLab: $GitLabUrl" -ForegroundColor White
            Write-Host "  2. Login with root / $RootPassword" -ForegroundColor White
            Write-Host "  3. Change password (recommended)" -ForegroundColor White
            Write-Host "  4. Push code: cd C:\Users\Admin\Downloads\projects\goose && git push gitlab main" -ForegroundColor White
            Write-Host ""
            Write-Host "GitKraken Token:" -ForegroundColor Cyan
            Write-Host "  Use this token to connect GitKraken: $token" -ForegroundColor White
            Write-Host ""

        } catch {
            Write-Host "  Failed to create project via API: $_" -ForegroundColor Red
            Write-Host "  You can create it manually at: $GitLabUrl/projects/new" -ForegroundColor Yellow
        }

    } else {
        Write-Host "  Failed to create token" -ForegroundColor Red
        Write-Host "  Please create manually in GitLab UI" -ForegroundColor Yellow
    }

} catch {
    Write-Host "  Error creating token: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual setup required:" -ForegroundColor Yellow
    Write-Host "  1. Open: $GitLabUrl" -ForegroundColor White
    Write-Host "  2. Login with root / $RootPassword" -ForegroundColor White
    Write-Host "  3. Create project manually" -ForegroundColor White
}

Write-Host ""
Write-Host "Desktop shortcut: Double-click 'GitLab Local' on your desktop" -ForegroundColor Cyan
Write-Host ""
