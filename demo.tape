# limps Demo Recording
# Install VHS: brew install vhs

Output .github/assets/limps-demo-2026.gif
Set FontSize 14
Set Width 1200
Set Height 800
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 20

# --- Scene 1: Quick Start ---
Type "# Quick Start with limps"
Enter
Sleep 500ms
Type "limps init demo-project --docs-path ./demo-plans"
Enter
Sleep 2s

# --- Scene 2: List Plans ---
Type "limps list-plans --project demo-project"
Enter
Sleep 2s

# --- Scene 3: Plan Status ---
Type "limps status 1 --project demo-project"
Enter
Sleep 2s

# --- Scene 4: Next Task ---
Type "limps next-task 1 --project demo-project"
Enter
Sleep 2s

# --- Scene 5: Knowledge Graph ---
Type "# Knowledge Graph"
Enter
Sleep 500ms
Type "limps graph reindex --project demo-project"
Enter
Sleep 2s

Type "limps graph health --project demo-project"
Enter
Sleep 2s

Type "limps graph search 'auth' --project demo-project"
Enter
Sleep 2s

Type "limps graph trace plan:0001 --project demo-project --direction down"
Enter
Sleep 2s

# --- Scene 6: Health Checks ---
Type "# Health Automation"
Enter
Sleep 500ms
Type "limps health check --project demo-project"
Enter
Sleep 2s

Type "limps health staleness --project demo-project"
Enter
Sleep 2s

# --- Scene 7: Proposals ---
Type "limps proposals list --project demo-project"
Enter
Sleep 1.5s

# --- Scene 8: Repair ---
Type "limps repair-plans --check --project demo-project"
Enter
Sleep 2s

# --- Scene 9: Multi-client sync ---
Type "# Sync to your AI clients"
Enter
Sleep 500ms
Type "limps config sync-mcp --client cursor --print"
Enter
Sleep 3s

Sleep 2s
