import ts from 'typescript';

/** Decode the published map assignment as data, never evaluate downloaded JS. */
export function readCoordinateData(text,id){
    const source=ts.createSourceFile(id+'.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    if(source.parseDiagnostics.length)throw Error('Invalid coordinate syntax');
    const statements=source.statements.filter(s=>!ts.isEmptyStatement(s));
    if(statements.length!==1||!ts.isExpressionStatement(statements[0]))throw Error('Expected one map assignment');
    const assignment=statements[0].expression;
    if(!ts.isBinaryExpression(assignment)||assignment.operatorToken.kind!==ts.SyntaxKind.EqualsToken)throw Error('Expected map assignment');
    const left=assignment.left;
    if(!ts.isElementAccessExpression(left)||!ts.isStringLiteral(left.argumentExpression)||left.argumentExpression.text!==id||left.expression.getText(source)!=='PlayMarioJas.PlayMarioJas.settings.maps.library')throw Error('Unexpected map destination');
    function literal(node){
        if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
        if(ts.isNumericLiteral(node))return Number(node.text);
        if(node.kind===ts.SyntaxKind.TrueKeyword)return true;if(node.kind===ts.SyntaxKind.FalseKeyword)return false;if(node.kind===ts.SyntaxKind.NullKeyword)return null;
        if(ts.isPrefixUnaryExpression(node)&&(node.operator===ts.SyntaxKind.MinusToken||node.operator===ts.SyntaxKind.PlusToken)&&ts.isNumericLiteral(node.operand))return (node.operator===ts.SyntaxKind.MinusToken?-1:1)*Number(node.operand.text);
        if(ts.isArrayLiteralExpression(node))return node.elements.map(literal);
        if(ts.isObjectLiteralExpression(node))return Object.fromEntries(node.properties.map(p=>{
            if(!ts.isPropertyAssignment(p)||!p.name||!(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)||ts.isNumericLiteral(p.name)))throw Error('Only literal properties are allowed');
            return [p.name.text,literal(p.initializer)];
        }));
        throw Error('Executable expressions are not allowed in coordinate data');
    }
    return literal(assignment.right);
}
