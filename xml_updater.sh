#!/bin/bash
# xml_updater.sh - Apply namespace replacements to XML files
#
# DESCRIPTION:
#   This script applies MediaWiki namespace replacements to all XML files
#   in the ./data folder. It processes the files based on the replacement
#   rules defined in replace.js, converting LinguaLibre namespaces to their
#   target destinations for migration purposes.
#
# USAGE:
#   ./xml_updater.sh [OPTIONS]
#
# OPTIONS:
#   -h, --help     Show this help message
#   -d, --dry-run  Show what would be changed without making modifications
#   -v, --verbose  Show detailed progress information (default)
#   -q, --quiet    Run silently, only show errors
#
# EXAMPLES:
#   ./xml_updater.sh              # Apply all replacements
#   ./xml_updater.sh --dry-run    # Preview changes without applying
#   ./xml_updater.sh --quiet      # Run silently
#
# REPLACEMENTS APPLIED:
#   /LinguaLibre:/    → Commons:Lingua Libre/
#   /Template:/       → Template:LL-
#   /Help:/           → Help:Lingua Libre/
#   /Category:/       → Category:LL-
#   /List:/           → Commons:Lingua Libre/List:
#   /Translations:/   → Translations:
#
# REQUIREMENTS:
#   - sed command
#   - find command
#   - XML files in ./data directory
#
# AUTHOR:
#   Generated from replace.js configuration
#
# WARNING:
#   This script modifies files in-place. Make sure to backup your data
#   before running this script.

# Parse command line arguments
DRY_RUN=false
VERBOSE=true
QUIET=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            sed -n '2,/^$/p' "$0" | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            QUIET=false
            shift
            ;;
        -q|--quiet)
            QUIET=true
            VERBOSE=false
            shift
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Use --help for usage information" >&2
            exit 1
            ;;
    esac
done

# Check if data directory exists
if [[ ! -d "./data" ]]; then
    echo "ERROR: ./data directory not found!" >&2
    exit 1
fi

# Count total files
total_files=$(find ./data -name "*.xml" -type f | wc -l)

if [[ $total_files -eq 0 ]]; then
    echo "No XML files found in ./data directory" >&2
    exit 1
fi

if [[ $QUIET != true ]]; then
    if [[ $DRY_RUN == true ]]; then
        echo "DRY RUN: Found $total_files XML files to analyze..."
    else
        echo "Found $total_files XML files to process..."
    fi
fi

current=0

# Define sed replacement commands
# <title>LinguaLibre:User rights</title> decides the pagename
SED_COMMANDS=(
    's|/LinguaLibre:/|Commons:Lingua Libre/|g'
    's|/Template:/|Template:LL-|g'
    's|/Help:/|Help:Lingua Libre/|g'
    's|/Category:/|Category:LL-|g'
    's|/List:/|Commons:Lingua Libre/List:|g'
    's|/Translations:/|Translations:|g'
    's|/Welcome\//|Welcome-LL/|g'
)

# Build sed command string
SED_CMD="sed"
for cmd in "${SED_COMMANDS[@]}"; do
    SED_CMD="$SED_CMD -e '$cmd'"
done

# Apply replacements to each XML file
find ./data -name "*.xml" -type f | while read -r file; do
    current=$((current + 1))
    
    if [[ $VERBOSE == true ]]; then
        echo "Processing ($current/$total_files): $file"
    fi
    
    if [[ $DRY_RUN == true ]]; then
        # Show what would change
        changes=$(eval "$SED_CMD" "$file" | diff "$file" - | wc -l)
        if [[ $changes -gt 0 ]]; then
            echo "  Would modify: $file ($((changes/2)) changes)"
            if [[ $VERBOSE == true ]]; then
                eval "$SED_CMD" "$file" | diff "$file" - | head -10
            fi
        fi
    else
        # Apply changes in-place
        eval "$SED_CMD -i" "$file"
    fi
done

if [[ $QUIET != true ]]; then
    if [[ $DRY_RUN == true ]]; then
        echo "DRY RUN completed! Use without --dry-run to apply changes."
    else
        echo "All replacements completed successfully!"
    fi
fi
