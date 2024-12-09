import { ConfigurationVariable } from "./configuration-variable";

export class ConfigurationProperty<T> {
  private mChanged: boolean;
  private mProp: T;

  constructor(prop: T) {
    this.mChanged = true;
    this.mProp = ConfigurationVariable.parse<T>(prop);
  }

  get value(): T {
    return this.mProp;
  }

  set value(value: T) {
    if (this.mProp !== value) {
      this.mProp = ConfigurationVariable.parse<T>(value);
      this.mChanged = true;
    }
  }

  get changed(): boolean {
    const old = this.mChanged;
    this.mChanged = false;
    return old;
  }

  set changed(state: boolean) {
    this.mChanged = state;
  }
}
