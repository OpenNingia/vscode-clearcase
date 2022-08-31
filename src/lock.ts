export class Lock {
  private mCount: number;
  constructor(private mAccessCnt: number) {
    this.mCount = 0;
  }
  public reserve(): boolean {
    const s = this.mCount;
    this.mCount++;
    return s < this.mAccessCnt;
  }

  public release() {
    this.mCount--;
  }
}
