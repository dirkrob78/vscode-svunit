import * as vscode from 'vscode';

const testRe = /^\s*`SVTEST\s*\(\s*(\w+)\s*\)/;

export const parseSVUnitTestFile = (text: string, events: {
	onTest(range: vscode.Range, label: string): void;
}) => {
	const lines = text.split('\n');

	lines.forEach((line, lineNo) => {
		const test = testRe.exec(line);
		if (test) {
			const [, label] = test;
			const range = new vscode.Range(new vscode.Position(lineNo, 0), new vscode.Position(lineNo, test[0].length));
			events.onTest(range, label);
		}
	});
};
