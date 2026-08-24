#!/bin/bash
# Pre-commit hook: block common secret patterns before they leak to git.
#
# Install (chaque repo homelab-*) :
#   ln -sf /mnt/ssd/config/scripts/pre-commit-secret-scan.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Override ponctuel (cas legitime) :
#   git commit --no-verify

set -u
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'

# Fichiers ignores (already gitignored ou par design)
IGNORE_FILES=(
    ".gitignore"
    "pre-commit-secret-scan.sh"
    "configuration.yml.example"
    "users_database.yml.example"
    ".env.example"
)

# Patterns qui DOIVENT PAS apparaitre dans un diff staged
# Format : "DESCRIPTION|REGEX"
PATTERNS=(
    # Cles privees
    "Private key PEM|^[+].*BEGIN (RSA |EC |DSA |OPENSSH |)PRIVATE KEY"

    # AWS
    "AWS access key|AKIA[0-9A-Z]{16}"
    "AWS secret key|aws_secret.*[0-9a-zA-Z/+]{40}"

    # GitHub / GitLab
    "GitHub token|gh[pousr]_[A-Za-z0-9]{36,}"
    "GitLab token|glpat-[A-Za-z0-9_-]{20,}"

    # Generic high-entropy
    "Bearer token in code|[Bb]earer [A-Za-z0-9_\\-]{32,}"
    "Basic auth b64|[Bb]asic [A-Za-z0-9+/=]{16,}"

    # Cloudflare
    "Cloudflare API token|CF_.*_TOKEN[[:space:]]*=[[:space:]]*[A-Za-z0-9_\\-]{30,}"

    # Tailscale
    "Tailscale authkey|tskey-(auth-|api-)[A-Za-z0-9]{10,}-[A-Za-z0-9]{20,}"

    # Backblaze B2
    "B2 account key|K00[0-9][A-Za-z0-9+/]{27,}"

    # Mots-cles dangereux (password=, secret=, token= avec valeur non vide non-placeholder)
    "Hardcoded password=|^[^#]*[Pp]assword[[:space:]]*=[[:space:]]*['\"\\\`][^\\\$<{][^'\"\\\`]{8,}"
    "Hardcoded secret=|^[^#]*[Ss]ecret[[:space:]]*=[[:space:]]*['\"\\\`][^\\\$<{][^'\"\\\`]{12,}"
)

# Fichiers staged
FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
[ -z "$FILES" ] && exit 0

VIOLATIONS=0
while IFS= read -r file; do
    # Skip ignored files
    for ig in "${IGNORE_FILES[@]}"; do
        [ "$(basename "$file")" = "$ig" ] && continue 2
    done
    # Skip binary
    if git diff --cached --numstat "$file" 2>/dev/null | grep -q '^-'; then
        continue
    fi

    DIFF=$(git diff --cached -U0 -- "$file" 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+')
    [ -z "$DIFF" ] && continue

    for pattern in "${PATTERNS[@]}"; do
        desc="${pattern%%|*}"
        regex="${pattern#*|}"
        if echo "$DIFF" | grep -qE "$regex"; then
            echo -e "${RED}LEAK DETECTED${NC} in $file: ${YELLOW}$desc${NC}"
            echo "$DIFF" | grep -nE "$regex" | head -3 | sed 's/^/  /'
            VIOLATIONS=$((VIOLATIONS + 1))
        fi
    done
done <<< "$FILES"

if [ "$VIOLATIONS" -gt 0 ]; then
    echo
    echo -e "${RED}Pre-commit secret scan: $VIOLATIONS violation(s) detected${NC}"
    echo "If this is a false positive:"
    echo "  - Add the file to IGNORE_FILES in pre-commit-secret-scan.sh"
    echo "  - OR use \`git commit --no-verify\` (use sparingly, only for legit cases)"
    exit 1
fi

echo -e "${GREEN}✓ Pre-commit secret scan passed${NC}"
exit 0
