/**
 * Markdown block parser and translator.
 * Splits markdown into typed blocks for translation while preserving structure.
 */

const CODE_PATTERNS = [
    /^\s*\/\*/,
    /^\s*\*\//,
    /^\s*\*\s/,
    /^\s*\/\//,
    /^\s*(const|let|var|function|class|import|export|return|if|else|for|while|switch|case)\b/,
    /^\s*\}/,
    /.*=>\s*\{/,
    /.*\{\s*$/,
    /^\s*[\w.]+\(/,
    /^\s*\$\(/,
    /^\s*window\./,
    /^\s*document\./,
    /.*;\s*$/,
    /^\s*├──\s/,
    /^\s*└──\s/,
    /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/,
    /^\s*[A-Z][A-Z_0-9]+\s*[:=]/,
    /^\s*[A-Z][A-Z_0-9]+\s*[—–]/,
];

const URL_ONLY_PATTERN = /^\s*https?:\/\/\S+\s*$/;

export function isCodeLine(line) {
    const stripped = line.trim();
    if (!stripped) return false;
    for (const pattern of CODE_PATTERNS) {
        if (pattern.test(line)) return true;
    }
    if (stripped.length > 3) {
        let alphaCount = 0;
        for (const c of stripped) {
            if (/[a-zA-Zа-яА-ЯёЁ]/.test(c)) alphaCount++;
        }
        const alphaRatio = alphaCount / stripped.length;
        if (alphaRatio < 0.3 && !URL_ONLY_PATTERN.test(line)) return true;
    }
    return false;
}

export function isUrlOnly(line) {
    return URL_ONLY_PATTERN.test(line);
}

export function parseMarkdownBlocks(text) {
    if (!text) return [];

    const blocks = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') {
            blocks.push({ type: 'empty', content: '', translatable: false });
            i++;
            continue;
        }

        const codeMatch = line.match(/^(`{3,}|~{3,})(.*)/);
        if (codeMatch) {
            const fenceChar = codeMatch[1][0];
            const fenceLen = codeMatch[1].length;
            const codeLines = [line];
            i++;
            while (i < lines.length) {
                codeLines.push(lines[i]);
                const closePattern = new RegExp(`^${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`);
                if (closePattern.test(lines[i])) {
                    i++;
                    break;
                }
                i++;
            }
            blocks.push({ type: 'code_block', content: codeLines.join('\n'), translatable: false });
            continue;
        }

        if (/^!\[/.test(line.trim())) {
            blocks.push({ type: 'image', content: line, translatable: false });
            i++;
            continue;
        }

        if (/^#{1,6}\s/.test(line)) {
            blocks.push({ type: 'heading', content: line, translatable: true });
            i++;
            continue;
        }

        if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
            blocks.push({ type: 'horizontal_rule', content: line, translatable: false });
            i++;
            continue;
        }

        if (isCodeLine(line)) {
            const codeLines = [line];
            i++;
            while (i < lines.length) {
                const l = lines[i];
                if (l.trim() === '') {
                    let lookahead = i + 1;
                    while (lookahead < lines.length && lines[lookahead].trim() === '') {
                        lookahead++;
                    }
                    if (lookahead < lines.length && isCodeLine(lines[lookahead])) {
                        codeLines.push(l);
                        i++;
                        continue;
                    } else {
                        break;
                    }
                } else if (/^!\[/.test(l.trim())) {
                    break;
                } else if (isCodeLine(l)) {
                    codeLines.push(l);
                    i++;
                } else {
                    let foundCodeAhead = false;
                    for (let k = 1; k < 3; k++) {
                        const nextIdx = i + k;
                        if (nextIdx < lines.length) {
                            const nextLine = lines[nextIdx];
                            if (/^!\[/.test(nextLine.trim())) break;
                            if (isCodeLine(nextLine)) {
                                foundCodeAhead = true;
                                break;
                            }
                        }
                    }
                    if (foundCodeAhead) {
                        codeLines.push(l);
                        i++;
                    } else {
                        break;
                    }
                }
            }
            blocks.push({ type: 'code_block', content: codeLines.join('\n'), translatable: false });
            continue;
        }

        if (isUrlOnly(line)) {
            blocks.push({ type: 'url', content: line, translatable: false });
            i++;
            continue;
        }

        blocks.push({ type: 'line', content: line, translatable: true });
        i++;
    }

    return blocks;
}

export function blocksToMarkdown(blocks) {
    return blocks.map(b => b.content).join('\n');
}

export function isHeadingCandidate(content, prevType, prevContent) {
    const stripped = content.trim();
    if (!stripped) return false;
    if (stripped.length > 100) return false;
    if (stripped.endsWith('.') || stripped.endsWith(',')) return false;
    if (stripped.includes('://')) return false;
    const sectionBreakTypes = [null, 'empty', 'image', 'url', 'code_block', 'horizontal_rule'];
    if (sectionBreakTypes.includes(prevType)) return true;
    if (prevType === 'line' && prevContent && prevContent.includes('://')) return true;
    return false;
}

export function blocksToYonoteMarkdown(blocks) {
    const parts = [];
    let prevType = null;
    let prevContent = null;

    for (const block of blocks) {
        const { type: btype, content } = block;

        if (btype === 'empty') {
            prevType = btype;
            prevContent = null;
            continue;
        }

        let output = content;

        if (btype === 'code_block') {
            if (!content.startsWith('```') && !content.startsWith('~~~')) {
                output = '```\n' + content + '\n```';
            }
        } else if (btype === 'url') {
            const url = content.trim();
            output = `[${url}](${url})`;
        } else if (btype === 'line') {
            if (isHeadingCandidate(content, prevType, prevContent)) {
                output = `## ${content}`;
            }
        }

        parts.push(output);
        prevType = btype;
        prevContent = content;
    }

    return parts.join('\n\n');
}

function stripMarkdownFormatting(text) {
    text = text.replace(/\*{1,3}(.*?)\*{1,3}/g, '$1');
    text = text.replace(/_{1,3}(.*?)_{1,3}/g, '$1');
    text = text.replace(/~~(.*?)~~/g, '$1');
    text = text.replace(/`(.*?)`/g, '$1');
    return text.trim();
}

function isPlainHeadingCandidate(stripped) {
    if (!stripped) return false;
    const isListItem = stripped.startsWith('- ') || stripped.startsWith('* ') ||
        stripped.startsWith('\u2022') || stripped.startsWith('-\t') || stripped.startsWith('*\t');
    return (
        stripped.length < 80 &&
        !stripped.startsWith('http') && !stripped.startsWith('!') &&
        !stripped.startsWith('[') && !stripped.startsWith('>') &&
        !stripped.startsWith('|') && !stripped.startsWith('\\') &&
        !stripped.startsWith('/') &&
        !isListItem &&
        !'.!?;:,)'.includes(stripped[stripped.length - 1])
    );
}

export function extractSectionFromText(text, headingName) {
    if (!text || !headingName) return null;

    const lines = text.split('\n');
    const headingLower = headingName.toLowerCase().trim();

    const headingsA = [];
    for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].trim();
        if (!stripped) continue;

        if (stripped.startsWith('#')) {
            const clean = stripMarkdownFormatting(stripped.replace(/^#+\s*/, ''));
            headingsA.push([i, clean]);
            continue;
        }

        if (isPlainHeadingCandidate(stripped)) {
            const prevIsEmpty = i === 0 || !lines[i - 1].trim();
            const nextIsEmpty = i === lines.length - 1 || !lines[i + 1].trim();
            if (prevIsEmpty && nextIsEmpty) {
                headingsA.push([i, stripMarkdownFormatting(stripped)]);
            }
        }
    }

    let targetIdx = null;
    let targetIsMarkdown = false;
    let nextHeadingIdx = null;

    for (let pos = 0; pos < headingsA.length; pos++) {
        const [lineIdx, headingText] = headingsA[pos];
        if (headingText.toLowerCase() === headingLower) {
            targetIdx = lineIdx;
            targetIsMarkdown = lines[lineIdx].trim().startsWith('#');
            for (let nextPos = pos + 1; nextPos < headingsA.length; nextPos++) {
                const nextLineIdx = headingsA[nextPos][0];
                if (targetIsMarkdown && !lines[nextLineIdx].trim().startsWith('#')) {
                    continue;
                }
                nextHeadingIdx = nextLineIdx;
                break;
            }
            break;
        }
    }

    if (targetIdx !== null) {
        const start = targetIdx + 1;
        const end = nextHeadingIdx !== null ? nextHeadingIdx : lines.length;
        const sectionText = lines.slice(start, end).join('\n').trim();
        return sectionText || null;
    }

    targetIdx = null;
    for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].trim();
        if (!stripped) continue;
        const clean = stripMarkdownFormatting(stripped);
        if (clean.toLowerCase() === headingLower && isPlainHeadingCandidate(stripped)) {
            targetIdx = i;
            break;
        }
    }

    if (targetIdx === null) return null;

    nextHeadingIdx = lines.length;
    for (let i = targetIdx + 1; i < lines.length; i++) {
        const stripped = lines[i].trim();
        if (!stripped) continue;
        const prevIsEmpty = i > 0 && !lines[i - 1].trim();
        if (prevIsEmpty) {
            if (stripped.startsWith('#') || isPlainHeadingCandidate(stripped)) {
                nextHeadingIdx = i;
                break;
            }
        }
    }

    const sectionText = lines.slice(targetIdx + 1, nextHeadingIdx).join('\n').trim();
    return sectionText || null;
}
