# GitLab CE Docker Setup Script
# Sets up GitLab Community Edition locally using Docker

param(
    [switch]$Install,
    [switch]$Start,
    [switch]$Stop,
    [switch]$Status,
    [switch]$Uninstall,
    [string]$Port = "8080"
)

$GitLabContainer = "gitlab-ce-local"
$GitLabImage = "gitlab/gitlab-ce:latest"
$GitLabHome = "$env:USERPROFILE\gitlab-data"

function Install-GitLab {
    Write-Host "=== Installing GitLab CE with Docker ===" -ForegroundColor Cyan
    Write-Host ""

    # Check Docker
    Write-Host "Checking Docker..." -ForegroundColor Yellow
    try {
        docker --version | Out-Null
        Write-Host "  ✓ Docker is installed" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Docker not found! Installing..." -ForegroundColor Red
        winget install Docker.DockerDesktop
        Write-Host "  Please restart Docker Desktop and run this script again" -ForegroundColor Yellow
        return
    }

    # Create data directory
    Write-Host "Creating GitLab data directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path "$GitLabHome\config" | Out-Null
    New-Item -ItemType Directory -Force -Path "$GitLabHome\logs" | Out-Null
    New-Item -ItemType Directory -Force -Path "$GitLabHome\data" | Out-Null
    Write-Host "  ✓ Created: $GitLabHome" -ForegroundColor Green

    # Pull GitLab image
    Write-Host "Pulling GitLab CE image (this may take 5-10 minutes)..." -ForegroundColor Yellow
    docker pull $GitLabImage

    # Create and start container
    Write-Host "Creating GitLab container..." -ForegroundColor Yellow
    docker run --detach `
        --hostname localhost `
        --name $GitLabContainer `
        --restart always `
        --publish ${Port}:80 `
        --publish 2222:22 `
        --volume ${GitLabHome}/config:/etc/gitlab `
        --volume ${GitLabHome}/logs:/var/log/gitlab `
        --volume ${GitLabHome}/data:/var/opt/gitlab `
        --shm-size 256m `
        $GitLabImage

    Write-Host ""
    Write-Host "=== GitLab CE Installation Complete ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "GitLab is starting up (takes 3-5 minutes)..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Access GitLab at: http://localhost:$Port" -ForegroundColor Cyan
    Write-Host "Data stored in: $GitLabHome" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Getting initial root password..." -ForegroundColor Yellow
    Write-Host "(Wait 3-5 minutes for GitLab to fully start)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To get password later, run:" -ForegroundColor Cyan
    Write-Host "  docker exec -it $GitLabContainer cat /etc/gitlab/initial_root_password" -ForegroundColor White
    Write-Host ""

    # Create desktop shortcut
    Create-DesktopShortcut
}

function Start-GitLab {
    Write-Host "Starting GitLab..." -ForegroundColor Yellow
    docker start $GitLabContainer
    Write-Host "  ✓ GitLab started" -ForegroundColor Green
    Write-Host "  Access at: http://localhost:$Port" -ForegroundColor Cyan
}

function Stop-GitLab {
    Write-Host "Stopping GitLab..." -ForegroundColor Yellow
    docker stop $GitLabContainer
    Write-Host "  ✓ GitLab stopped" -ForegroundColor Green
}

function Get-Status {
    Write-Host "=== GitLab Status ===" -ForegroundColor Cyan
    Write-Host ""

    $status = docker ps -a --filter "name=$GitLabContainer" --format "{{.Status}}"
    if ($status) {
        Write-Host "Container: $status" -ForegroundColor Yellow

        if ($status -like "Up*") {
            Write-Host "  ✓ GitLab is RUNNING" -ForegroundColor Green
            Write-Host "  URL: http://localhost:$Port" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Root password:" -ForegroundColor Yellow
            docker exec -it $GitLabContainer cat /etc/gitlab/initial_root_password 2>$null
        } else {
            Write-Host "  ✗ GitLab is STOPPED" -ForegroundColor Red
            Write-Host "  Run: .\gitlab-docker-setup.ps1 -Start" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✗ GitLab not installed" -ForegroundColor Red
        Write-Host "  Run: .\gitlab-docker-setup.ps1 -Install" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Data location: $GitLabHome" -ForegroundColor Cyan
}

function Uninstall-GitLab {
    Write-Host "=== Uninstalling GitLab ===" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "WARNING: This will delete all GitLab data!" -ForegroundColor Red
    $confirm = Read-Host "Type 'yes' to confirm"

    if ($confirm -eq "yes") {
        Write-Host "Stopping and removing container..." -ForegroundColor Yellow
        docker stop $GitLabContainer 2>$null
        docker rm $GitLabContainer 2>$null

        Write-Host "Removing data directory..." -ForegroundColor Yellow
        Remove-Item -Path $GitLabHome -Recurse -Force -ErrorAction SilentlyContinue

        Write-Host "Removing desktop shortcut..." -ForegroundColor Yellow
        $shortcut = "$env:USERPROFILE\Desktop\GitLab Local.url"
        Remove-Item -Path $shortcut -Force -ErrorAction SilentlyContinue

        Write-Host "  ✓ GitLab uninstalled" -ForegroundColor Green
    } else {
        Write-Host "  Cancelled" -ForegroundColor Yellow
    }
}

function Create-DesktopShortcut {
    Write-Host "Creating desktop shortcut..." -ForegroundColor Yellow

    $shortcutPath = "$env:USERPROFILE\Desktop\GitLab Local.url"
    $content = @"
[InternetShortcut]
URL=http://localhost:$Port
IconIndex=0
"@

    Set-Content -Path $shortcutPath -Value $content
    Write-Host "  ✓ Created desktop shortcut: GitLab Local" -ForegroundColor Green
}

function Show-Help {
    Write-Host "=== GitLab CE Docker Setup ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\gitlab-docker-setup.ps1 -Install     # Install GitLab CE"
    Write-Host "  .\gitlab-docker-setup.ps1 -Start       # Start GitLab"
    Write-Host "  .\gitlab-docker-setup.ps1 -Stop        # Stop GitLab"
    Write-Host "  .\gitlab-docker-setup.ps1 -Status      # Check status"
    Write-Host "  .\gitlab-docker-setup.ps1 -Uninstall   # Remove GitLab"
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  -Port 8080    # Change port (default: 8080)"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\gitlab-docker-setup.ps1 -Install -Port 9000"
    Write-Host "  .\gitlab-docker-setup.ps1 -Status"
    Write-Host ""
}

# Main execution
if ($Install) {
    Install-GitLab
} elseif ($Start) {
    Start-GitLab
} elseif ($Stop) {
    Stop-GitLab
} elseif ($Status) {
    Get-Status
} elseif ($Uninstall) {
    Uninstall-GitLab
} else {
    Show-Help
}
