export class ConfigurationVariable {
  static parse<T>(value: T): T {
    if (value === null || value === "" || typeof value !== "string") {
      return value;
    }

    if (typeof value === "string") {
      const idx = value.indexOf("env:");
      let retVal = value as string;
      if (idx > 0) {
        const matches = value.matchAll(/\$\{env:(\w+)\}/gi);
        for (const subgrp of matches) {
          if (subgrp.length > 0) {
            if (subgrp[1] in process.env) {
              const v = process.env[subgrp[1]];
              if (v !== undefined) {
                retVal = retVal.replace(subgrp[0], v);
              }
            }
          }
        }
      }
      return retVal as T;
    }
    return value;
  }
}
