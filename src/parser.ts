import path = require('path');
import * as vscode from 'vscode';

export async function discoverAllFilesInWorkspace(
    controller: vscode.TestController,
    workspaceItem: vscode.TestItem,
    workspaceFolder: vscode.WorkspaceFolder
): Promise<boolean> {
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/*unit_test.sv');
    const testFiles = await vscode.workspace.findFiles(pattern);
    console.log(`Found ${testFiles.length} test files in ${workspaceFolder.name}.`);
    
    const hasTests = testFiles.length > 0;
    
    for (const file of testFiles) {
        await processTestFile(controller, file, workspaceItem, workspaceFolder);
    }

    // Set up file system watcher
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(async file => {
        console.log(`File changed: ${file.toString()}`);
        await processTestFile(controller, file, workspaceItem, workspaceFolder);
    });

    watcher.onDidCreate(async file => {
        console.log(`File created: ${file.toString()}`);
        await processTestFile(controller, file, workspaceItem, workspaceFolder);
    });

    watcher.onDidDelete(uri => {
        // Remove the test item from the controller
        console.log(`File deleted: ${uri.toString()}`);
        const testItem = findTestItemByUri(workspaceItem, uri);
        if (testItem && testItem.parent) {
            // Delete the test item from its parent list
            testItem.parent.children.delete(testItem.id);
            // If parent test item (folder) is now empty, clean up the hierarchy
            cleanupEmptyParents(testItem.parent);
        }
    });
    
    return hasTests;
}

function cleanupEmptyParents(item: vscode.TestItem) {
    if (item.children.size === 0 && item.parent) {
        item.parent.children.delete(item.id);
        cleanupEmptyParents(item.parent);
    }
}

function findTestItemByUri(parent: vscode.TestItem, uri: vscode.Uri): vscode.TestItem | undefined {
    if (parent.uri?.toString() === uri.toString()) {
        return parent;
    }
    
    let result: vscode.TestItem | undefined;
    parent.children.forEach(child => {
        if (!result) {
            result = findTestItemByUri(child, uri);
        }
    });
    
    return result;
}

async function processTestFile(
    controller: vscode.TestController,
    file: vscode.Uri,
    workspaceItem: vscode.TestItem,
    workspaceFolder: vscode.WorkspaceFolder
) {
    const testFile = getOrCreateFile(controller, file, workspaceItem, workspaceFolder);
    if (testFile) {
        await parseTestsInFileContents(controller, testFile);
    }
}

export function getOrCreateFile(
    controller: vscode.TestController,
    uri: vscode.Uri,
    workspaceItem: vscode.TestItem,
    workspaceFolder: vscode.WorkspaceFolder
) {
    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    const pathSegments = relativePath.split(path.sep);
    
    // Build hierarchy: workspace -> folders -> file
    let currentParent = workspaceItem;
    
    // Create folder hierarchy (all segments except the last one which is the file)
    for (let i = 0; i < pathSegments.length - 1; i++) {
        const segment = pathSegments[i];
        const segmentPath = pathSegments.slice(0, i + 1).join('/') + '/';
        const segmentId = `${workspaceItem.id}/${segmentPath}`;
        
        let folderItem = currentParent.children.get(segmentId);
        if (!folderItem) {
            const segmentUri = vscode.Uri.joinPath(workspaceFolder.uri, ...pathSegments.slice(0, i + 1));
            folderItem = controller.createTestItem(segmentId, segmentPath, segmentUri);
            currentParent.children.add(folderItem);
        }
        currentParent = folderItem;
    }

    // Create or get the file-level test item
    const fileId = uri.toString();
    const existing = currentParent.children.get(fileId);
    if (existing) {
        return existing;
    }

    const file = controller.createTestItem(
        fileId,
        path.basename(uri.fsPath),
        uri
    );
    file.canResolveChildren = true;
    currentParent.children.add(file);
    console.log(`Created test item for file: ${file.label}`);
    return file;
}

export async function parseTestsInFileContents(
    controller: vscode.TestController,
    file: vscode.TestItem,
    contents?: string
) {
    if (!file.uri) {
        console.log('File URI is undefined.');
        return;
    }

    if (contents === undefined) {
        const rawContent = await vscode.workspace.fs.readFile(file.uri);
        contents = new TextDecoder().decode(rawContent);
    }

    const svtestRe = /^\s*\`SVTEST\s*\(\s*(\w+)\s*\)/;
    const svtestEndRe = /^\s*\`SVTEST_END/;

    const lines = contents.split('\n');

    let startLineNo = -1;
    let label = '';
    // Delete all children
    file.children.forEach(child => file.children.delete(child.id));

    lines.forEach((line, lineNo) => {
        const svtest = svtestRe.exec(line);
        if (svtest) {
            [, label] = svtest;
            startLineNo = lineNo;
        }

        const svtestEnd = svtestEndRe.exec(line);
        if (svtestEnd && startLineNo !== -1) {
            const range = new vscode.Range(
                new vscode.Position(startLineNo, 0),
                new vscode.Position(lineNo, line.length)
            );
            const tcase = controller.createTestItem(label, label, file.uri);
            tcase.range = range;
            file.children.add(tcase);
            console.log(`Added test case: ${label}`);
        }
    });
}
