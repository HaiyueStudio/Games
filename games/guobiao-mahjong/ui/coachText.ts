export function wrapCoachText(text:string,ems:number):string[]{
  const lines:string[]=[];for(const paragraph of text.split('\n')){let line='',used=0;for(const char of [...paragraph]){const units=char.charCodeAt(0)<128?.55:1;if(line&&used+units>ems){lines.push(line);line='';used=0}line+=char;used+=units}if(line)lines.push(line)}return lines;
}
