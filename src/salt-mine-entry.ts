export interface SaltMineEntry<D = any, MD = any> {
  created: number;
  type: string;
  data: D;
  metadata: MD;
}
