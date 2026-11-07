/** Per-student legal softmax average, preserving the checkpoint ensemble's operation order. */
export function policyProbabilities(logits:readonly ArrayLike<number>[],indices:readonly number[]):Float64Array{
  if(!logits.length||!indices.length)throw Error('Empty model policy');const probabilities=new Float64Array(indices.length);
  for(const values of logits){
    if(values.length!==235||indices.some(i=>!Number.isFinite(values[i])))throw Error('Non-finite model output');
    const max=Math.max(...indices.map(i=>values[i]!)),scores=indices.map(i=>Math.exp(values[i]!-max)),sum=scores.reduce((a,b)=>a+b,0);
    scores.forEach((v,i)=>probabilities[i]!+=v/sum/logits.length);
  }return probabilities;
}
