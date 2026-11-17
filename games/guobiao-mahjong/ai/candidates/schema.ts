export interface DenseNetwork {mean:readonly number[];scale:readonly number[];w1:readonly (readonly number[])[];b1:readonly number[];w2:readonly (readonly number[])[];b2:readonly number[]}
export interface CandidateModel {
  schemaVersion:1;featureVersion:1;
  risk:DenseNetwork&{calibration:readonly number[]};preference:DenseNetwork&{limit:number};
  settings:{topCandidates:number;minimumPrior:number;priorRatio:number;minimumMargin:number;maximumRiskIncrease:number};
  riskNames:readonly string[];qualityNames:readonly string[];
}
