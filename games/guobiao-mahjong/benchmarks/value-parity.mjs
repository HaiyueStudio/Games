/** Browser and Node Math intrinsics can differ in their last few bits. Shapes and finite values stay exact requirements. */
export function valueFeatureError(actual,expected){
  if(actual.length!==expected.length||!actual.length)throw Error('Value feature shape mismatch');let maximum=0;
  for(let i=0;i<actual.length;i++){if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i]))throw Error('Nonfinite value feature');maximum=Math.max(maximum,Math.abs(actual[i]-expected[i]));}
  if(maximum>1e-12)throw Error('Value feature parity mismatch: '+maximum);return maximum;
}
