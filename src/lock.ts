export class Lock {
  private mCount: number;

  constructor(private mAccessCnt: number) {
    this.mCount = 0;
  }

  reserve(): boolean {
    const s = this.mCount;
    this.mCount++;
    return s < this.mAccessCnt;
  }

  release(): void {
    this.mCount--;
  }
}
