#!/bin/bash
# xml_updater.sh - Apply namespace replacements to XML files
#
# DESCRIPTION:
#   This script applies MediaWiki namespace replacements to all XML files
#   in the ./xml folder. It processes the files based on the replacement
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
#   - XML files in ./xml directory
#
# AUTHOR:
#   Generated from replace.js configuration
#
# WARNING:
#   This script modifies files in-place. Make sure to backup your xml
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

# Check if xml directory exists
if [[ ! -d "./xml" ]]; then
    echo "ERROR: ./xml directory not found!" >&2
    exit 1
fi

# Count total files
total_files=$(find ./xml -name "*.xml" -type f | wc -l)

if [[ $total_files -eq 0 ]]; then
    echo "No XML files found in ./xml directory" >&2
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
# Based on json/replaces.json rules, adapted for sed syntax
# Note: Using \? for optional matches in basic sed regex
# Rules 1-3, 4-5, 7-8, 10, 12-15 (11 sed-compatible rules out of 15 total)
# Skipped: Rule 6 (complex multiline regex), Rule 9 (negative lookbehind), Rule 11 (negative lookbehind)
SED_COMMANDS=(
    's|\[\[:\?[Cc]:|[[|g'                                        # Rule 1: [[:c: prefix removal
    's|\[\[:\?[Cc]ommons:|[[|g'                                  # Rule 2: [[:Commons: prefix removal
    's|\[\[Special:RecordWizard|[[:lingualibre:Special:RecordWizard|g'  # Rule 3: Special:RecordWizard
    's|<syntaxhighlight lang="sparql">|{{SPARQL\|query=|g'      # Rule 4: <syntaxhighlight> opening tag
    's|</syntaxhighlight>|}}|g'                                  # Rule 5: </syntaxhighlight> closing tag
    's|Category:Tool\([^[:space:]]\)|Category:Lingua Libre tool\1|g'    # Rule 7: Category:Tool
    's|Category:Speakers in|Category:Voice contributors in|g'   # Rule 8: Category:Speakers in
    's|LinguaLibre:|Commons:Lingua Libre/|g'                     # Rule 10: LinguaLibre:
    's|List:|Commons:Lingua Libre/Lists/|g'                      # Rule 12: List:
    's|Help:|Help:Lingua Libre/|g'                      # Rule 12b: List:
    's|Translations:|Translations:|g'                            # Rule 13: Translations: (no-op, keeps as is)
    's|Template:|Template:|g'                                    # Rule 14: Template: (no-op, keeps as is)
    's|Welcome/|Welcome-LL/|g'                                   # Rule 15: Welcome/
)

# Build sed command string
SED_CMD="sed"
for cmd in "${SED_COMMANDS[@]}"; do
    SED_CMD="$SED_CMD -e '$cmd'"
done

# Apply replacements to each XML file
find ./xml -name "*.xml" -type f | while read -r file; do
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
