// CAA SORA 2.5 containment matrix (adjacent area). Pure file without imports:
// shared by the map (src/lib/adjacentAreaCalculator.ts) and edge functions.
export type UaSizeKey = "1m" | "3mShelterApplicable" | "3mShelterNotApplicable" | "8m" | "20m" | "40m";
export type SailLevel = "I" | "II" | "III" | "IV" | "V" | "VI";
export type PopulationDensityCategory = "50" | "500" | "5k" | "50k" | "NoLimit";
export type OutdoorAssembliesCategory = "40k" | "40kTo400k" | "400k";
export type ContainmentRequirement = "Low" | "Medium" | "High" | "Out of scope" | "Error";

type ContainmentMatrix = Record<UaSizeKey, Partial<Record<PopulationDensityCategory | "400k" | "40kTo400k", Record<OutdoorAssembliesCategory, Record<SailLevel, ContainmentRequirement>>>>>;

export const CONTAINMENT_DATA = {
  "1m": {
    "NoLimit": {
      "400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50k": {
      "400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Low",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "3mShelterApplicable": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Low",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "3mShelterNotApplicable": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "500": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Low",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "8m": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "500": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Low",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "20m": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      }
    },
    "500": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "40m": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      }
    },
    "500": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  }
} as const satisfies ContainmentMatrix;

export function calculateContainmentRequirement(
  uaSize: UaSizeKey,
  sail: SailLevel,
  populationDensity: PopulationDensityCategory,
  outdoorAssemblies: OutdoorAssembliesCategory
): ContainmentRequirement {
  let selectedColumn: PopulationDensityCategory | "400k" | "40kTo400k" = populationDensity;
  if (outdoorAssemblies !== "40k" && (outdoorAssemblies === "400k" || populationDensity === "NoLimit")) {
    selectedColumn = outdoorAssemblies === "400k" ? "400k" : "40kTo400k";
  }

  const matrix: ContainmentMatrix = CONTAINMENT_DATA;
  const values = matrix[uaSize]?.[selectedColumn]?.[outdoorAssemblies]
    ?? matrix[uaSize]?.[populationDensity]?.[outdoorAssemblies];

  return values?.[sail] ?? "Error";
}
