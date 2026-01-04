#!/usr/bin/env node
// clean-xml.js - Apply replacements to XML files
//
// DESCRIPTION:
//   This script applies replacements to all ./xml/*.xml files. It processes the files based on the replacement
//   rules defined in json/replaces.json, and it outputs cleaned copies in folder ./output .
//
// USAGE:
//   node clean-xml.js [OPTIONS]
//   ./clean-xml.js [OPTIONS]  (if executable)
//
// OPTIONS:
//   -h, --help           Show this help message
//   -t, --test           Run test suite to validate replacement rules
//   -d, --dry-run        Show what would be changed without making modifications
//   -v, --verbose        Show detailed progress information (default)
//   -q, --quiet          Run silently, only show errors
//   --activate=<value>   Activate conditional rules (e.g., --activate=list)
//
// EXAMPLES:
//   node clean-xml.js                  # Apply all replacements
//   node clean-xml.js --test           # Run test suite
//   node clean-xml.js --dry-run        # Preview changes without applying
//   node clean-xml.js --quiet          # Run silently
//   node clean-xml.js --activate=list  # Activate rules that require 'list'
//
// REPLACEMENTS APPLIED:
//   See json/replaces.json for complete list of transformation rules.
// 
// REQUIREMENTS:
//   - Node.js (ES6+)
//   - json/replaces.json file with transformation rules
//   - XML files in ./xml directory (not required for --test mode)
//
// OUTPUT:
//   Cleaned XML files are saved to ./output directory

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let dryRun = false;
let verbose = true;
let quiet = false;
let testMode = false;
const activatedFeatures = new Set();

for (const arg of args) {
    switch (arg) {
        case '-h':
        case '--help':
            const scriptContent = fs.readFileSync(__filename, 'utf8');
            const lines = scriptContent.split('\n');
            const helpLines = [];
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].startsWith('//')) {
                    helpLines.push(lines[i].replace(/^\/\/ ?/, ''));
                } else {
                    break;
                }
            }
            console.log(helpLines.join('\n'));
            process.exit(0);
            break;
        case '-t':
        case '--test':
            testMode = true;
            break;
        case '-d':
        case '--dry-run':
            dryRun = true;
            break;
        case '-v':
        case '--verbose':
            verbose = true;
            quiet = false;
            break;
        case '-q':
        case '--quiet':
            quiet = true;
            verbose = false;
            break;
        default:
            // Check for --activate=value parameter
            if (arg.startsWith('--activate=')) {
                const feature = arg.substring('--activate='.length);
                if (feature) {
                    activatedFeatures.add(feature);
                } else {
                    console.error('ERROR: --activate requires a value (e.g., --activate=list)');
                    process.exit(1);
                }
            } else {
                console.error(`Unknown option: ${arg}`);
                console.error('Use --help for usage information');
                process.exit(1);
            }
    }
}

// Load replacement rules
const rulesPath = path.join(__dirname, 'json', 'replaces.json');
let rules;

try {
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    rules = JSON.parse(rulesContent).rules;
} catch (error) {
    console.error(`ERROR: Failed to load ${rulesPath}`);
    console.error(error.message);
    process.exit(1);
}

// Test suite - runs when --test flag is used
if (testMode) {
    console.log('Testing replaces.json patterns:\n');
    
    const testCases = [
        { input: '[[:c:Lingua Libre/List]]', expects: '[[Lingua Libre/List]]' },
        { input: '[[:Commons:Lingua Libre/List]]', expects: '[[Lingua Libre/List]]' },
        { input: '[[:commons:Lingua Libre/List]]', expects: '[[Lingua Libre/List]]' },
        { input: '[[Special:RecordWizard]]', expects: '[[:lingualibre:Special:RecordWizard]]' },
        { input: '<title>Category:Tool</title>', expects: '<title>Category:Lingua Libre tool</title>' },
        { input: '<title>Category:Speakers in fra</title>', expects: '<title>Category:Voice contributors in fra</title>' },
        { input: '<title>Help:SPARQL</title>', expects: '<title>Help:Lingua Libre/SPARQL</title>' },
        { input: '<title>List:Fra/Animals</title>', expects: '<title>Commons:Lingua Libre/List/Fra/Animals</title>' },
        { input: '<title>Welcome/</title>', expects: '<title>Welcome-LL/</title>' },
        // Additional edge cases
        { input: '<title>LinguaLibre:Main Page</title>', expects: '<title>Commons:Lingua Libre/Main Page</title>' },
        { input: '<title>User:Example</title>', expects: '<title>User:Example</title>' },
        { input: '<title>Template:Example</title>', expects: '<title>Template:Example</title>' },
        { input: '<title>Translations:Something</title>', expects: '<title>Translations:Something</title>' },
        { input: '=Speakers in English=', expects: '=Voice contributors in English=' },
        { input: `{| style="width:100%" 
|- style="vertical-align:top;"
|style="padding: 0 3em;width:60%"|
<syntaxhighlight lang="sparql">
SELECT ?speaker (COUNT(?audio) AS ?audio)
WHERE { ?speaker prop:P2 entity:Q3  # Add labels : }
ORDER BY DESC (?audio)
</syntaxhighlight>
|
<query _pagination="10" item="Property" itemLabel="Values">
SELECT ?speaker (COUNT(?audio) AS ?audio)
WHERE { ?speaker prop:P2 entity:Q3  # Add labels : }
ORDER BY DESC (?audio)
</query>
|}`,
            expects: `{{SPARQL|query=
SELECT ?speaker (COUNT(?audio) AS ?audio)
WHERE { ?speaker prop:P2 entity:Q3  # Add labels : }
ORDER BY DESC (?audio)
}}` },
        { input: `<text bytes="37" sha1="ki0q0lz9v78h5i2lfxsuvb8lm5ur8c7" xml:space="preserve">Blabla</text>`, 
            expects: activatedFeatures.has('list') ? `<text bytes="37" sha1="ki0q0lz9v78h5i2lfxsuvb8lm5ur8c7" xml:space="preserve">{{Lingua Libre list
|code=
|quality=
|method=
|items=word
|dictionary=false
}}

# Blabla</text>` : `<text bytes="37" sha1="ki0q0lz9v78h5i2lfxsuvb8lm5ur8c7" xml:space="preserve">Blabla</text>` },
        { input: '[https://lingualibre.org/index.php?title=Special:RecordWizard&amp;oldid=123456 RecordWizard]', 
            expects: '[[Special:RecordWizard|RecordWizard]]' },
        { input: '[https://commons.org/w/index.php?title=Commons:Lingua_Libre&amp;oldid=789 Lingua Libre]', 
            expects: '[[Commons:Lingua_Libre|Lingua Libre]]' },
        { input: 'Template:Speaker of the month', expects: 'Template:Voice contributor of the month' },
        // Line-by-line processing tests (requires --activate=list)
        { input: '<text>* apple\n* banana\n* cherry</text>', 
            expects: activatedFeatures.has('list') ? `<text>{{Lingua Libre list
|code=
|quality=
|method=
|items=word
|dictionary=false
}}

# apple
# banana
# cherry</text>` : '<text>* apple\n* banana\n* cherry</text>' },
        { input: '<text>  word1\n  word2\n  word3</text>', 
            expects: activatedFeatures.has('list') ? `<text>{{Lingua Libre list
|code=
|quality=
|method=
|items=word
|dictionary=false
}}

# word1
# word2
# word3</text>` : '<text>  word1\n  word2\n  word3</text>' },
        { input: '<text>*word1\n  word2\n* word3</text>', 
            expects: activatedFeatures.has('list') ? `<text>{{Lingua Libre list
|code=
|quality=
|method=
|items=word
|dictionary=false
}}

# word1
# word2
# word3</text>` : '<text>*word1\n  word2\n* word3</text>' },
    ];
    
    // Apply all rules to text (both content and rename)
    function applyTestRules(text) {
        let result = text;
        for (const rule of rules) {
            // Skip rules that have a 'requires' field if that feature is not activated
            if (rule.requires && !activatedFeatures.has(rule.requires)) {
                continue;
            }
            const flags = rule.flags || 'g';
            const regex = new RegExp(rule.match, flags);
            // Convert escaped newlines in replacement string to actual newlines
            const replacement = rule.replace.replace(/\\n/g, '\n');
            
            // Check if this rule should process line-by-line
            if (rule.process === 'lineByLine') {
                // Process line-by-line within <text> elements
                result = result.replace(/(<text[^>]*>)([\s\S]*?)(<\/text>)/g, (match, openTag, textContent, closeTag) => {
                    const lines = textContent.split('\n');
                    const processedLines = lines.map(line => line.replace(regex, replacement));
                    return openTag + processedLines.join('\n') + closeTag;
                });
            } else {
                // Normal replacement
                result = result.replace(regex, replacement);
            }
        }
        return result;
    }
    
    // Run tests
    let passed = 0;
    let failed = 0;
    
    testCases.forEach((test, index) => {
        const result = applyTestRules(test.input);
        const success = result === test.expects;
        
        if (success) {
            passed++;
            console.log(`✅ Test ${index + 1}: PASS`);
        } else {
            failed++;
            console.log(`❌ Test ${index + 1}: FAIL`);
            // Show details only for failed tests
        }  
        console.log(`   Input:    ${test.input}`);
        console.log(`   Expects:  ${test.expects}`);
        console.log(`   Got:      ${result}`);
    });
    
    console.log(`\n${passed}/${testCases.length} tests passed`);
    process.exit(failed > 0 ? 1 : 0);
}

// Check if xml directory exists
const xmlDir = path.join(__dirname, 'xml');
if (!fs.existsSync(xmlDir)) {
    console.error('ERROR: ./xml directory not found!');
    process.exit(1);
}

// Get all XML files
const xmlFiles = fs.readdirSync(xmlDir)
    .filter(file => file.endsWith('.xml'))
    .map(file => path.join(xmlDir, file));

if (xmlFiles.length === 0) {
    console.error('No XML files found in ./xml directory');
    process.exit(1);
}

// Create output directory
const outputDir = path.join(__dirname, 'output');
if (!dryRun && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

if (!quiet) {
    if (dryRun) {
        console.log(`DRY RUN: Found ${xmlFiles.length} XML files to analyze...`);
    } else {
        console.log(`Found ${xmlFiles.length} XML files to process...`);
    }
    if (activatedFeatures.size > 0) {
        console.log(`Activated features: ${Array.from(activatedFeatures).join(', ')}`);
    }
}

// Apply rules to content
function applyRules(content, filename) {
    let modified = content;
    let changesCount = 0;
    const changes = [];

    for (const rule of rules) {
        // Skip rules that have a 'requires' field if that feature is not activated
        if (rule.requires && !activatedFeatures.has(rule.requires)) {
            continue;
        }
        try {
            // Get flags from rule or default to 'g'
            const flags = rule.flags || 'g';
            const regex = new RegExp(rule.match, flags);
            const before = modified;
            // Convert escaped newlines in replacement string to actual newlines
            const replacement = rule.replace.replace(/\\n/g, '\n');
            
            // Check if this rule should process line-by-line
            if (rule.process === 'lineByLine') {
                // Process line-by-line within <text> elements
                modified = modified.replace(/(<text[^>]*>)([\s\S]*?)(<\/text>)/g, (match, openTag, textContent, closeTag) => {
                    // Split content into lines
                    const lines = textContent.split('\n');
                    let lineChanges = 0;
                    
                    // Apply regex to each line
                    const processedLines = lines.map(line => {
                        const lineBefore = line;
                        const lineAfter = line.replace(regex, replacement);
                        if (lineBefore !== lineAfter) {
                            lineChanges++;
                        }
                        return lineAfter;
                    });
                    
                    if (lineChanges > 0) {
                        changesCount += lineChanges;
                    }
                    
                    // Rejoin lines
                    return openTag + processedLines.join('\n') + closeTag;
                });
                
                if (before !== modified && verbose) {
                    changes.push(`  Rule (lineByLine): ${rule.match.substring(0, 50)}... -> ${changesCount} line replacements`);
                }
            } else {
                // Normal replacement
                modified = modified.replace(regex, replacement);
                
                if (before !== modified) {
                    const ruleChanges = (before.match(regex) || []).length;
                    changesCount += ruleChanges;
                    if (verbose) {
                        changes.push(`  Rule: ${rule.match.substring(0, 50)}... -> ${ruleChanges} replacements`);
                    }
                }
            }
        } catch (error) {
            console.error(`ERROR: Invalid regex pattern in rule: ${rule.match}`);
            console.error(`  ${error.message}`);
        }
    
    }

    return { modified, changesCount, changes };
}

// Process each XML file
let totalChanges = 0;

for (let i = 0; i < xmlFiles.length; i++) {
    const file = xmlFiles[i];
    const filename = path.basename(file);
    
    if (verbose) {
        console.log(`Processing (${i + 1}/${xmlFiles.length}): ${filename}`);
    }
    
    try {
        // Read the file
        const content = fs.readFileSync(file, 'utf8');
        
        // Apply rules
        const { modified, changesCount, changes } = applyRules(content, filename);
        
        if (changesCount > 0) {
            totalChanges += changesCount;
            
            if (!quiet) {
                console.log(`  ${dryRun ? 'Would apply' : 'Applied'} ${changesCount} changes`);
                if (verbose && changes.length > 0) {
                    changes.slice(0, 10).forEach(change => console.log(change));
                    if (changes.length > 10) {
                        console.log(`  ... and ${changes.length - 10} more changes`);
                    }
                }
            }
            
            if (!dryRun) {
                // Write to output directory
                const outputPath = path.join(outputDir, filename);
                fs.writeFileSync(outputPath, modified, 'utf8');
            }
        } else {
            if (verbose) {
                console.log(`  No changes needed`);
            }
            
            if (!dryRun) {
                // Copy unchanged file to output
                const outputPath = path.join(outputDir, filename);
                fs.copyFileSync(file, outputPath);
            }
        }
    } catch (error) {
        console.error(`ERROR processing ${filename}: ${error.message}`);
    }
}

if (!quiet) {
    if (dryRun) {
        console.log(`\nDRY RUN completed! Would apply ${totalChanges} total changes.`);
        console.log('Use without --dry-run to apply changes and save to ./output directory.');
    } else {
        console.log(`\nAll replacements completed successfully!`);
        console.log(`Applied ${totalChanges} total changes.`);
        console.log(`Cleaned files saved to ./output directory.`);
    }
}
