(function () {
  const FY_LABEL = "FY 2025-26";
  const OLD_STANDARD_DEDUCTION = 50000;
  const NEW_STANDARD_DEDUCTION = 75000;
  const SECTION_80C_LIMIT = 150000;
  const SECTION_80CCD_1B_LIMIT = 50000;
  const OLD_REBATE_LIMIT = 500000;
  const OLD_REBATE_MAX = 12500;
  const NEW_REBATE_LIMIT = 1200000;
  const NEW_REBATE_MAX = 60000;
  const DEFAULT_MEAL_EXEMPTION_CAP = 26400;

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function calculateHraExemption(inputs) {
    // HRA exemption under the old regime:
    // lower of actual HRA, 50%/40% of basic, and rent paid minus 10% of basic.
    const basic = toNumber(inputs.basicSalary);
    const actualHra = toNumber(inputs.hraReceived);
    const rentPaid = toNumber(inputs.rentPaid);
    const cityMultiplier = inputs.cityType === "metro" ? 0.5 : 0.4;
    const rentMinusBasicBuffer = Math.max(0, rentPaid - basic * 0.1);

    return roundMoney(
      Math.max(
        0,
        Math.min(actualHra, basic * cityMultiplier, rentMinusBasicBuffer)
      )
    );
  }

  function calculateSalaryBreakup(inputs) {
    const basicSalary = toNumber(inputs.basicSalary);
    const hraReceived = toNumber(inputs.hraReceived);
    const specialAllowance = toNumber(inputs.specialAllowance);
    const performanceBonus = toNumber(inputs.performanceBonus);
    const lta = toNumber(inputs.lta);
    const mealAllowance = toNumber(inputs.mealAllowance);
    const mobileReimbursement = toNumber(inputs.mobileReimbursement);
    const carFuelReimbursement = toNumber(inputs.carFuelReimbursement);
    const driverSalary = toNumber(inputs.driverSalary);
    const employerPf = toNumber(inputs.employerPf);
    const otherAllowances = toNumber(inputs.otherAllowances);
    const otherExemptions = toNumber(inputs.otherExemptions);
    const totalCtc = toNumber(inputs.totalCtc);
    const mealCap = toNumber(inputs.mealExemptionCap) || DEFAULT_MEAL_EXEMPTION_CAP;

    const grossSalary =
      basicSalary +
      hraReceived +
      specialAllowance +
      performanceBonus +
      lta +
      mealAllowance +
      mobileReimbursement +
      carFuelReimbursement +
      driverSalary +
      otherAllowances +
      employerPf;

    const exemptionsOld = {
      hra: calculateHraExemption(inputs),
      lta: inputs.claimLta ? lta : 0,
      meal: Math.min(mealAllowance, mealCap),
      mobile: inputs.mobileReimbursed ? mobileReimbursement : 0,
      carFuel: inputs.carFuelExempt ? carFuelReimbursement : 0,
      other: otherExemptions,
    };

    const totalExemptionsOld = roundMoney(
      exemptionsOld.hra +
      exemptionsOld.lta +
      exemptionsOld.meal +
      exemptionsOld.mobile +
      exemptionsOld.carFuel +
      exemptionsOld.other
    );

    return {
      components: {
        basicSalary,
        hraReceived,
        specialAllowance,
        performanceBonus,
        lta,
        mealAllowance,
        mobileReimbursement,
        carFuelReimbursement,
        driverSalary,
        employerPf,
        otherAllowances,
        otherExemptions,
        totalCtc,
      },
      grossSalary: roundMoney(grossSalary),
      exemptionsOld,
      totalExemptionsOld,
      totalExemptionsNew: 0,
    };
  }

  function calculateDeductions(inputs) {
    // Old-regime Chapter VI-A deductions used in this calculator.
    // 80C includes employee PF + user-entered 80C investments, capped at Rs 1.5 lakh.
    // 80CCD(1B) is separately capped at Rs 50,000.
    const employeePf = toNumber(inputs.employeePf);
    const investments80C = toNumber(inputs.investments80C);
    const insurance80D = toNumber(inputs.insurance80D);
    const nps80ccd1b = toNumber(inputs.nps80ccd1b);

    const total80CInvested = employeePf + investments80C;
    const deduction80C = Math.min(total80CInvested, SECTION_80C_LIMIT);
    const deduction80D = insurance80D;
    const deduction80ccd1b = Math.min(nps80ccd1b, SECTION_80CCD_1B_LIMIT);

    return {
      employeePf,
      investments80C,
      insurance80D,
      nps80ccd1b,
      total80CInvested,
      deduction80C,
      deduction80D,
      deduction80ccd1b,
      oldTotal: roundMoney(deduction80C + deduction80D + deduction80ccd1b),
      newTotal: 0,
      remaining80C: Math.max(0, SECTION_80C_LIMIT - deduction80C),
    };
  }

  function computeSlabTax(income, slabs) {
    let remaining = income;
    let tax = 0;

    for (const slab of slabs) {
      if (remaining <= 0) {
        break;
      }

      const taxableSlice = Math.min(remaining, slab.upto - slab.from);
      if (taxableSlice > 0) {
        tax += taxableSlice * slab.rate;
        remaining -= taxableSlice;
      }
    }

    return roundMoney(Math.max(0, tax));
  }

  const OLD_SLABS = [
    { from: 0, upto: 250000, rate: 0 },
    { from: 250000, upto: 500000, rate: 0.05 },
    { from: 500000, upto: 1000000, rate: 0.2 },
    { from: 1000000, upto: Number.POSITIVE_INFINITY, rate: 0.3 },
  ];

  const NEW_SLABS = [
    { from: 0, upto: 400000, rate: 0 },
    { from: 400000, upto: 800000, rate: 0.05 },
    { from: 800000, upto: 1200000, rate: 0.1 },
    { from: 1200000, upto: 1600000, rate: 0.15 },
    { from: 1600000, upto: 2000000, rate: 0.2 },
    { from: 2000000, upto: 2400000, rate: 0.25 },
    { from: 2400000, upto: Number.POSITIVE_INFINITY, rate: 0.3 },
  ];

  function calculateOldRegimeTax(taxableIncome) {
    // Old regime:
    // standard deduction Rs 50,000, normal slabs, rebate up to Rs 12,500 when taxable income <= Rs 5 lakh.
    const taxBeforeRebate = computeSlabTax(taxableIncome, OLD_SLABS);
    const rebate = taxableIncome <= OLD_REBATE_LIMIT ? Math.min(taxBeforeRebate, OLD_REBATE_MAX) : 0;
    const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate);
    const cess = roundMoney(taxAfterRebate * 0.04);

    return {
      taxBeforeRebate,
      rebate,
      cess,
      totalTax: roundMoney(taxAfterRebate + cess),
    };
  }

  function calculateNewRegimeTax(taxableIncome) {
    // FY 2025-26 / AY 2026-27 new regime:
    // standard deduction Rs 75,000, revised slabs, rebate up to Rs 60,000 for income up to Rs 12 lakh.
    // Marginal relief ensures tax does not exceed income above Rs 12 lakh.
    const taxBeforeRebate = computeSlabTax(taxableIncome, NEW_SLABS);
    let rebate = 0;

    if (taxableIncome <= NEW_REBATE_LIMIT) {
      rebate = Math.min(taxBeforeRebate, NEW_REBATE_MAX);
    } else {
      const excessIncome = taxableIncome - NEW_REBATE_LIMIT;
      const marginalReliefRebate = taxBeforeRebate - excessIncome;
      rebate = clamp(marginalReliefRebate, 0, NEW_REBATE_MAX);
    }

    const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate);
    const cess = roundMoney(taxAfterRebate * 0.04);

    return {
      taxBeforeRebate,
      rebate,
      cess,
      totalTax: roundMoney(taxAfterRebate + cess),
    };
  }

  function buildInsights(inputs, salary, deductions, comparison) {
    const savingsLevers = [];

    if (salary.exemptionsOld.hra > 0) {
      savingsLevers.push({
        label: "HRA exemption",
        amount: salary.exemptionsOld.hra,
        note: "Lower taxable salary under old regime",
      });
    }
    if (salary.exemptionsOld.meal > 0) {
      savingsLevers.push({
        label: "Meal allowance exemption",
        amount: salary.exemptionsOld.meal,
        note: "Capped at your configured per-year allowance cap",
      });
    }
    if (salary.exemptionsOld.mobile > 0) {
      savingsLevers.push({
        label: "Mobile reimbursement",
        amount: salary.exemptionsOld.mobile,
        note: "Exempt because reimbursement is enabled",
      });
    }
    if (salary.exemptionsOld.carFuel > 0) {
      savingsLevers.push({
        label: "Car/Fuel reimbursement",
        amount: salary.exemptionsOld.carFuel,
        note: "Excluded in old regime because exemption is toggled on",
      });
    }
    if (salary.exemptionsOld.lta > 0) {
      savingsLevers.push({
        label: "LTA claim",
        amount: salary.exemptionsOld.lta,
        note: "Applied only because LTA claim is enabled",
      });
    }
    if (deductions.deduction80C > 0) {
      savingsLevers.push({
        label: "Section 80C",
        amount: deductions.deduction80C,
        note: "Includes employee PF and 80C investments",
      });
    }
    if (deductions.deduction80D > 0) {
      savingsLevers.push({
        label: "Section 80D",
        amount: deductions.deduction80D,
        note: "Health insurance deduction under old regime",
      });
    }
    if (deductions.deduction80ccd1b > 0) {
      savingsLevers.push({
        label: "NPS 80CCD(1B)",
        amount: deductions.deduction80ccd1b,
        note: "Additional NPS deduction under old regime",
      });
    }

    const recommended = comparison.old.totalTax <= comparison.new.totalTax ? "old" : "new";
    const bestTax = Math.min(comparison.old.totalTax, comparison.new.totalTax);
    const altTax = Math.max(comparison.old.totalTax, comparison.new.totalTax);
    const difference = roundMoney(Math.abs(altTax - bestTax));
    const effectiveSavingRateOld = getMarginalRate(comparison.old.taxableIncome, "old") * 1.04;
    const remaining80C = deductions.remaining80C;
    const extra80CSavings = roundMoney(remaining80C * effectiveSavingRateOld);

    const suggestions = [];
    if (remaining80C > 0 && recommended === "old") {
      suggestions.push(
        "Add " +
          formatCurrency(remaining80C) +
          " more to 80C and you could save about " +
          formatCurrency(extra80CSavings) +
          " in old-regime tax."
      );
    }
    if (!inputs.mobileReimbursed && toNumber(inputs.mobileReimbursement) > 0) {
      suggestions.push("Mark mobile reimbursement as reimbursed to exclude that amount in the old regime.");
    }
    if (!inputs.claimLta && toNumber(inputs.lta) > 0) {
      suggestions.push("Enable the LTA claim if you have valid travel proof; otherwise the full amount stays taxable.");
    }
    if (toNumber(inputs.rentPaid) > 0 && salary.exemptionsOld.hra === 0 && toNumber(inputs.hraReceived) > 0) {
      suggestions.push("Your current HRA exemption is nil because rent is not high enough after the 10% of basic adjustment.");
    }

    return {
      savingsLevers,
      recommended,
      difference,
      suggestions,
    };
  }

  function getMarginalRate(income, regime) {
    const slabs = regime === "new" ? NEW_SLABS : OLD_SLABS;
    let rate = 0;

    for (const slab of slabs) {
      if (income > slab.from) {
        rate = slab.rate;
      }
    }

    return rate;
  }

  function validateInputs(inputs, salary) {
    const errors = [];
    const warnings = [];
    const totalCtc = toNumber(inputs.totalCtc);
    const exemptOld = salary.totalExemptionsOld;

    if (totalCtc > 0 && salary.grossSalary > totalCtc) {
      warnings.push("Gross salary is higher than the entered total CTC. Check annual values or employer PF treatment.");
    }
    if (toNumber(inputs.hraReceived) > 0 && toNumber(inputs.rentPaid) === 0) {
      warnings.push("HRA received is entered but rent paid is zero, so HRA exemption will not apply.");
    }
    if (toNumber(inputs.basicSalary) === 0 && salary.grossSalary > 0) {
      warnings.push("Basic salary is zero. That is unusual for a salaried structure and may reduce HRA accuracy.");
    }
    if (exemptOld > salary.grossSalary) {
      errors.push("Total old-regime exemptions cannot exceed gross salary.");
    }
    if (toNumber(inputs.otherExemptions) > salary.grossSalary) {
      errors.push("Other exemptions look too high versus the annual salary structure.");
    }

    return { errors, warnings };
  }

  function calculateComparison(rawInputs) {
    const inputs = Object.assign({}, rawInputs);
    const salary = calculateSalaryBreakup(inputs);
    const deductions = calculateDeductions(inputs);
    const validation = validateInputs(inputs, salary);

    // Old regime taxable income allows salary exemptions, the old standard deduction,
    // and Chapter VI-A deductions such as 80C / 80D / 80CCD(1B).
    const oldSalaryIncome = Math.max(
      0,
      salary.grossSalary - salary.totalExemptionsOld - Math.min(OLD_STANDARD_DEDUCTION, salary.grossSalary)
    );
    const oldTaxableIncome = Math.max(0, oldSalaryIncome - deductions.oldTotal);

    // New regime ignores these salary exemptions/deductions here and only applies
    // the standard deduction for salaried taxpayers.
    const newTaxableIncome = Math.max(
      0,
      salary.grossSalary - Math.min(NEW_STANDARD_DEDUCTION, salary.grossSalary)
    );

    const oldTax = calculateOldRegimeTax(oldTaxableIncome);
    const newTax = calculateNewRegimeTax(newTaxableIncome);

    const comparison = {
      old: {
        standardDeduction: Math.min(OLD_STANDARD_DEDUCTION, salary.grossSalary),
        totalExemptions: salary.totalExemptionsOld,
        totalDeductions: deductions.oldTotal,
        taxableIncome: roundMoney(oldTaxableIncome),
        taxBeforeRebate: oldTax.taxBeforeRebate,
        rebate: oldTax.rebate,
        cess: oldTax.cess,
        totalTax: oldTax.totalTax,
      },
      new: {
        standardDeduction: Math.min(NEW_STANDARD_DEDUCTION, salary.grossSalary),
        totalExemptions: salary.totalExemptionsNew,
        totalDeductions: deductions.newTotal,
        taxableIncome: roundMoney(newTaxableIncome),
        taxBeforeRebate: newTax.taxBeforeRebate,
        rebate: newTax.rebate,
        cess: newTax.cess,
        totalTax: newTax.totalTax,
      },
    };

    return {
      fyLabel: FY_LABEL,
      constants: {
        oldStandardDeduction: OLD_STANDARD_DEDUCTION,
        newStandardDeduction: NEW_STANDARD_DEDUCTION,
        section80CLimit: SECTION_80C_LIMIT,
        section80ccd1bLimit: SECTION_80CCD_1B_LIMIT,
        mealCap: toNumber(inputs.mealExemptionCap) || DEFAULT_MEAL_EXEMPTION_CAP,
      },
      salary,
      deductions,
      comparison,
      validation,
      insights: buildInsights(inputs, salary, deductions, comparison),
    };
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(value || 0));
  }

  function formatCompactCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Math.round(value || 0));
  }

  window.taxCalculator = {
    constants: {
      fyLabel: FY_LABEL,
      oldStandardDeduction: OLD_STANDARD_DEDUCTION,
      newStandardDeduction: NEW_STANDARD_DEDUCTION,
      section80CLimit: SECTION_80C_LIMIT,
      section80ccd1bLimit: SECTION_80CCD_1B_LIMIT,
      defaultMealExemptionCap: DEFAULT_MEAL_EXEMPTION_CAP,
    },
    calculateComparison,
    calculateHraExemption,
    formatCurrency,
    formatCompactCurrency,
    toNumber,
  };
})();
