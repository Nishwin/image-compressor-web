(function () {
  const ReactLib = window.React;
  const ReactDOMLib = window.ReactDOM;
  const { useMemo, useState } = ReactLib;
  const h = ReactLib.createElement;
  const tax = window.taxCalculator;

  const INITIAL_INPUTS = {
    basicSalary: 900000,
    hraReceived: 360000,
    specialAllowance: 220000,
    performanceBonus: 120000,
    lta: 30000,
    claimLta: true,
    mealAllowance: 26400,
    mealExemptionCap: tax.constants.defaultMealExemptionCap,
    mobileReimbursement: 24000,
    mobileReimbursed: true,
    carFuelReimbursement: 60000,
    carFuelExempt: true,
    driverSalary: 0,
    employerPf: 108000,
    employeePf: 108000,
    otherAllowances: 90000,
    otherExemptions: 0,
    rentPaid: 300000,
    cityType: "metro",
    investments80C: 42000,
    insurance80D: 25000,
    nps80ccd1b: 30000,
    totalCtc: 1948400,
  };

  const FIELD_SECTIONS = [
    {
      title: "Core Salary",
      subtitle: "Annual salary components used to compute your gross income.",
      fields: [
        {
          key: "basicSalary",
          label: "Basic Salary",
          tip: "Base annual salary. HRA exemption and PF usage depend on this number.",
          max: 5000000,
          step: 10000,
          slider: true,
        },
        {
          key: "hraReceived",
          label: "HRA Received",
          tip: "Annual HRA actually received from your employer.",
          max: 2000000,
          step: 5000,
          slider: true,
        },
        {
          key: "specialAllowance",
          label: "Special Allowance",
          tip: "Typically fully taxable under both regimes.",
          max: 2500000,
          step: 5000,
        },
        {
          key: "performanceBonus",
          label: "Performance Linked Incentive",
          tip: "Bonus or variable pay, fully taxable.",
          max: 2500000,
          step: 5000,
        },
      ],
    },
    {
      title: "Allowances With Tax Logic",
      subtitle: "Switch exemptions on only where valid supporting proofs exist.",
      fields: [
        {
          key: "lta",
          label: "LTA",
          tip: "Leave Travel Allowance. Old-regime exemption applies only when claimed with proof.",
          max: 200000,
          step: 1000,
          toggleKey: "claimLta",
          toggleLabel: "Claim exemption",
        },
        {
          key: "mealAllowance",
          label: "Meal Allowance",
          tip: "Exempt in the old regime up to the configured annual cap.",
          max: 120000,
          step: 600,
        },
        {
          key: "mobileReimbursement",
          label: "Mobile Reimbursement",
          tip: "Exempt in the old regime when reimbursement is actually supported.",
          max: 120000,
          step: 1000,
          toggleKey: "mobileReimbursed",
          toggleLabel: "Reimbursed",
        },
        {
          key: "carFuelReimbursement",
          label: "Car/Fuel Reimbursement",
          tip: "Treated as exempt in the old regime when eligible proof-based reimbursement is enabled.",
          max: 300000,
          step: 1000,
          toggleKey: "carFuelExempt",
          toggleLabel: "Exempt",
        },
        {
          key: "driverSalary",
          label: "Driver Salary",
          tip: "Kept as taxable input unless separately handled by policy.",
          max: 240000,
          step: 1000,
        },
      ],
    },
    {
      title: "Other Inputs",
      subtitle: "Extra structure and reimbursement values used in the salary breakup.",
      fields: [
        {
          key: "employerPf",
          label: "Employer PF",
          tip: "Included in gross salary and CTC validation. Not separately deducted here.",
          max: 500000,
          step: 1000,
        },
        {
          key: "employeePf",
          label: "Employee PF",
          tip: "Counts toward Section 80C usage in the old regime.",
          max: 500000,
          step: 1000,
          highlight: "saver",
        },
        {
          key: "otherAllowances",
          label: "Other Allowances",
          tip: "Grouped fully taxable allowances.",
          max: 2000000,
          step: 1000,
        },
        {
          key: "otherExemptions",
          label: "Other Exemptions",
          tip: "Use this only for valid salary exemptions not covered elsewhere.",
          max: 500000,
          step: 1000,
          highlight: "saver",
        },
        {
          key: "totalCtc",
          label: "Total CTC",
          tip: "Validation-only figure to help catch inconsistent salary structures.",
          max: 8000000,
          step: 10000,
          slider: true,
        },
      ],
    },
  ];

  const DEDUCTION_FIELDS = [
    {
      key: "rentPaid",
      label: "Rent Paid",
      tip: "Annual rent used for HRA exemption. Zero rent means no HRA exemption.",
      max: 2400000,
      step: 5000,
      slider: true,
      highlight: "saver",
    },
    {
      key: "investments80C",
      label: "80C Investments",
      tip: "ELSS, PPF, life insurance and other 80C eligible investments. Employee PF is auto-added separately.",
      max: 150000,
      step: 1000,
      slider: true,
      highlight: "saver",
    },
    {
      key: "insurance80D",
      label: "80D Health Insurance",
      tip: "Health insurance deduction. Enter the eligible amount as per your profile.",
      max: 100000,
      step: 1000,
      highlight: "saver",
    },
    {
      key: "nps80ccd1b",
      label: "NPS 80CCD(1B)",
      tip: "Additional NPS deduction beyond 80C, capped at Rs 50,000.",
      max: 50000,
      step: 1000,
      slider: true,
      highlight: "saver",
    },
    {
      key: "mealExemptionCap",
      label: "Meal Exemption Cap",
      tip: "Annual cap applied to meal allowance exemption. Default is based on Rs 50 per meal style treatment.",
      max: 60000,
      step: 600,
    },
  ];

  function cx() {
    return Array.from(arguments).filter(Boolean).join(" ");
  }

  function formatCurrency(value) {
    return tax.formatCurrency(value);
  }

  function formatCompact(value) {
    return tax.formatCompactCurrency(value);
  }

  function parseInputValue(value) {
    if (value === "" || value === null || value === undefined) {
      return 0;
    }
    return Math.max(0, Number(value) || 0);
  }

  function ToggleSwitch(props) {
    return h(
      "button",
      {
        type: "button",
        onClick: props.onToggle,
        className: cx(
          "relative inline-flex h-7 w-14 items-center rounded-full border transition duration-200",
          props.checked
            ? "border-teal bg-teal"
            : "border-stone-300 bg-white"
        ),
        "aria-pressed": props.checked,
        title: props.label,
      },
      h("span", {
        className: cx(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition duration-200",
          props.checked ? "translate-x-7" : "translate-x-1"
        ),
      })
    );
  }

  function InfoLabel(props) {
    return h(
      "div",
      { className: "flex items-center gap-2" },
      h("span", { className: "text-sm font-semibold text-stone-900" }, props.label),
      h(
        "span",
        {
          className: "inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white/90",
          title: props.tip,
        },
        "i"
      ),
      props.badge
        ? h(
            "span",
            {
              className: "rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-700",
            },
            props.badge
          )
        : null
    );
  }

  function MoneyField(props) {
    const highlight = props.highlight === "saver";
    return h(
      "div",
      {
        className: cx(
          "rounded-[28px] border p-4 transition",
          highlight ? "border-emerald-300 bg-emerald-50/80" : "border-stone-200 bg-white/80"
        ),
      },
      h(
        "div",
        { className: "mb-3 flex items-start justify-between gap-3" },
        h(InfoLabel, {
          label: props.label,
          tip: props.tip,
          badge: highlight ? "Tax Saver" : null,
        }),
        props.toggleKey
          ? h(
              "div",
              { className: "flex items-center gap-2 text-xs font-semibold text-stone-600" },
              h("span", null, props.toggleLabel),
              h(ToggleSwitch, {
                label: props.toggleLabel,
                checked: !!props.toggleValue,
                onToggle: function () {
                  props.onToggle(props.toggleKey);
                },
              })
            )
          : null
      ),
      h(
        "div",
        { className: "flex items-center gap-3" },
        h(
          "div",
          {
            className: "rounded-2xl bg-stone-100 px-3 py-3 text-sm font-semibold text-stone-600",
          },
          "Rs"
        ),
        h("input", {
          type: "number",
          min: 0,
          step: props.step || 1000,
          value: props.value,
          onChange: props.onChange,
          className:
            "money-input w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base font-semibold text-stone-900 outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/10",
        })
      ),
      props.slider
        ? h("input", {
            type: "range",
            min: 0,
            max: props.max,
            step: props.step || 1000,
            value: Math.min(props.value, props.max),
            onChange: props.onChange,
            className: "range-track mt-4 h-2 w-full cursor-pointer rounded-full",
          })
        : null
    );
  }

  function StatCard(props) {
    return h(
      "div",
      {
        className: cx(
          "rounded-[28px] border p-5",
          props.emphasis
            ? "border-teal/20 bg-gradient-to-br from-teal to-pine text-white"
            : "border-stone-200 bg-white/85"
        ),
      },
      h(
        "div",
        { className: cx("text-xs font-bold uppercase tracking-[0.28em]", props.emphasis ? "text-white/70" : "text-stone-500") },
        props.label
      ),
      h(
        "div",
        { className: cx("mt-3 text-2xl font-extrabold", props.emphasis ? "text-white" : "text-stone-900") },
        props.value
      ),
      props.note
        ? h(
            "div",
            { className: cx("mt-2 text-sm", props.emphasis ? "text-white/75" : "text-stone-600") },
            props.note
          )
        : null
    );
  }

  function BreakdownRow(props) {
    return h(
      "div",
      { className: "flex items-center justify-between gap-4 border-b border-stone-100 py-3 last:border-b-0" },
      h("span", { className: "text-sm text-stone-600" }, props.label),
      h("span", { className: "text-sm font-bold text-stone-900" }, props.value)
    );
  }

  function Pill(props) {
    return h(
      "div",
      { className: "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" },
      h("span", { className: "font-bold" }, props.label + ": "),
      props.value
    );
  }

  function App() {
    const [inputs, setInputs] = useState(INITIAL_INPUTS);

    const result = useMemo(function () {
      return tax.calculateComparison(inputs);
    }, [inputs]);

    const betterRegimeLabel = result.insights.recommended === "old" ? "Old Regime" : "New Regime";
    const savingsDifference = result.insights.difference;

    function updateNumber(key, value) {
      setInputs(function (current) {
        return Object.assign({}, current, { [key]: parseInputValue(value) });
      });
    }

    function updateToggle(key) {
      setInputs(function (current) {
        return Object.assign({}, current, { [key]: !current[key] });
      });
    }

    function updateSelect(key, value) {
      setInputs(function (current) {
        return Object.assign({}, current, { [key]: value });
      });
    }

    return h(
      "main",
      { className: "relative overflow-hidden" },
      h("div", { className: "absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top,rgba(21,111,106,0.18),transparent_52%)]" }),
      h(
        "div",
        { className: "relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10" },
        h(
          "section",
          { className: "fade-up glass-panel rounded-[36px] border border-white/60 px-6 py-8 sm:px-8 lg:px-10" },
          h(
            "div",
            { className: "flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between" },
            h(
              "div",
              { className: "max-w-3xl" },
              h(
                "div",
                { className: "mb-4 inline-flex items-center rounded-full border border-stone-200 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.28em] text-stone-600" },
                "India Income Tax Calculator",
                h("span", { className: "mx-2 text-stone-300" }, "|"),
                result.fyLabel
              ),
              h("h1", { className: "font-display text-4xl leading-tight text-ink sm:text-5xl lg:text-6xl" }, "Allowance-aware salary tax planning, built for real Indian payslips."),
              h(
                "p",
                { className: "mt-4 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg" },
                "Compare old and new regimes live, account for HRA, LTA, reimbursements, PF and deductions, and spot exactly which salary components are doing the heavy lifting."
              ),
              h(
                "div",
                { className: "mt-6 flex flex-wrap gap-3 text-sm text-stone-600" },
                h("span", { className: "rounded-full bg-white px-4 py-2" }, "Detailed salary structure"),
                h("span", { className: "rounded-full bg-white px-4 py-2" }, "Realtime old vs new regime"),
                h("span", { className: "rounded-full bg-white px-4 py-2" }, "HRA + deduction insights")
              )
            ),
            h(
              "div",
              { className: "grid gap-3 sm:grid-cols-3 lg:w-[32rem]" },
              h(StatCard, {
                label: "Gross Salary",
                value: formatCompact(result.salary.grossSalary),
                note: "Annual salary components before exemptions and deductions",
              }),
              h(StatCard, {
                label: "Best Tax",
                value: formatCompact(Math.min(result.comparison.old.totalTax, result.comparison.new.totalTax)),
                note: betterRegimeLabel,
              }),
              h(StatCard, {
                label: "Tax Saved",
                value: savingsDifference > 0 ? formatCompact(savingsDifference) : formatCurrency(0),
                note: "Difference between the two regimes",
                emphasis: true,
              })
            )
          )
        ),
        h(
          "section",
          { className: "fade-up-delay mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]" },
          h(
            "div",
            { className: "space-y-6" },
            FIELD_SECTIONS.map(function (section) {
              return h(
                "div",
                { key: section.title, className: "glass-panel rounded-[32px] p-6 sm:p-7" },
                h("div", { className: "mb-5" },
                  h("h2", { className: "text-2xl font-extrabold text-stone-900" }, section.title),
                  h("p", { className: "mt-2 text-sm leading-6 text-stone-600" }, section.subtitle)
                ),
                h(
                  "div",
                  { className: "grid gap-4 md:grid-cols-2" },
                  section.fields.map(function (field) {
                    return h(MoneyField, {
                      key: field.key,
                      label: field.label,
                      tip: field.tip,
                      value: inputs[field.key],
                      max: field.max,
                      step: field.step,
                      slider: field.slider,
                      highlight: field.highlight,
                      toggleKey: field.toggleKey,
                      toggleLabel: field.toggleLabel,
                      toggleValue: field.toggleKey ? inputs[field.toggleKey] : null,
                      onToggle: updateToggle,
                      onChange: function (event) {
                        updateNumber(field.key, event.target.value);
                      },
                    });
                  })
                )
              );
            }),
            h(
              "div",
              { className: "glass-panel rounded-[32px] p-6 sm:p-7" },
              h("div", { className: "mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between" },
                h("div", null,
                  h("h2", { className: "text-2xl font-extrabold text-stone-900" }, "HRA, Deductions & Settings"),
                  h("p", { className: "mt-2 text-sm leading-6 text-stone-600" }, "These inputs directly impact the old-regime outcome and recommendation.")
                ),
                h(
                  "div",
                  { className: "rounded-[24px] border border-stone-200 bg-white/80 p-3" },
                  h("label", { className: "mb-2 block text-xs font-bold uppercase tracking-[0.24em] text-stone-500" }, "City Type"),
                  h(
                    "div",
                    { className: "flex gap-2" },
                    ["metro", "non-metro"].map(function (cityType) {
                      const active = inputs.cityType === cityType;
                      return h(
                        "button",
                        {
                          key: cityType,
                          type: "button",
                          onClick: function () {
                            updateSelect("cityType", cityType);
                          },
                          className: cx(
                            "rounded-full px-4 py-2 text-sm font-bold capitalize transition",
                            active ? "bg-pine text-white" : "bg-stone-100 text-stone-700"
                          ),
                        },
                        cityType
                      );
                    })
                  )
                )
              ),
              h(
                "div",
                { className: "grid gap-4 md:grid-cols-2" },
                DEDUCTION_FIELDS.map(function (field) {
                  return h(MoneyField, {
                    key: field.key,
                    label: field.label,
                    tip: field.tip,
                    value: inputs[field.key],
                    max: field.max,
                    step: field.step,
                    slider: field.slider,
                    highlight: field.highlight,
                    onChange: function (event) {
                      updateNumber(field.key, event.target.value);
                    },
                  });
                })
              )
            )
          ),
          h(
            "aside",
            { className: "space-y-6 lg:sticky lg:top-6 lg:self-start" },
            h(
              "div",
              { className: "glass-panel rounded-[32px] p-6 sm:p-7" },
              h("div", { className: "flex items-start justify-between gap-4" },
                h("div", null,
                  h("div", { className: "text-xs font-bold uppercase tracking-[0.24em] text-stone-500" }, "Recommendation"),
                  h("h2", { className: "mt-2 text-3xl font-extrabold text-stone-900" }, betterRegimeLabel)
                ),
                h(
                  "div",
                  {
                    className: cx(
                      "rounded-full px-4 py-2 text-sm font-bold",
                      result.insights.recommended === "old" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                    ),
                  },
                  result.insights.recommended === "old" ? "Exemptions win" : "Lower slab wins"
                )
              ),
              h(
                "p",
                { className: "mt-3 text-sm leading-6 text-stone-600" },
                "For the current annual structure, this regime keeps your total tax lower by ",
                h("span", { className: "font-extrabold text-stone-900" }, formatCurrency(savingsDifference)),
                "."
              ),
              h(
                "div",
                { className: "mt-6 grid gap-3 sm:grid-cols-2" },
                h(StatCard, {
                  label: "Old Regime Tax",
                  value: formatCurrency(result.comparison.old.totalTax),
                  note: "Tax after rebate and 4% cess",
                }),
                h(StatCard, {
                  label: "New Regime Tax",
                  value: formatCurrency(result.comparison.new.totalTax),
                  note: "Uses FY 2025-26 slab structure",
                })
              )
            ),
            h(
              "div",
              { className: "glass-panel rounded-[32px] p-6 sm:p-7" },
              h("h3", { className: "text-xl font-extrabold text-stone-900" }, "Regime Breakdown"),
              h("div", { className: "mt-4 rounded-[28px] border border-stone-200 bg-white/85 p-5" },
                h("div", { className: "mb-3 text-sm font-bold uppercase tracking-[0.24em] text-stone-500" }, "Old Regime"),
                h(BreakdownRow, { label: "Gross Salary", value: formatCurrency(result.salary.grossSalary) }),
                h(BreakdownRow, { label: "Total Exemptions", value: formatCurrency(result.comparison.old.totalExemptions) }),
                h(BreakdownRow, { label: "Standard Deduction", value: formatCurrency(result.comparison.old.standardDeduction) }),
                h(BreakdownRow, { label: "Other Deductions", value: formatCurrency(result.comparison.old.totalDeductions) }),
                h(BreakdownRow, { label: "Taxable Income", value: formatCurrency(result.comparison.old.taxableIncome) }),
                h(BreakdownRow, { label: "Tax Payable", value: formatCurrency(result.comparison.old.totalTax) })
              ),
              h("div", { className: "mt-4 rounded-[28px] border border-stone-200 bg-white/85 p-5" },
                h("div", { className: "mb-3 text-sm font-bold uppercase tracking-[0.24em] text-stone-500" }, "New Regime"),
                h(BreakdownRow, { label: "Gross Salary", value: formatCurrency(result.salary.grossSalary) }),
                h(BreakdownRow, { label: "Total Exemptions", value: formatCurrency(result.comparison.new.totalExemptions) }),
                h(BreakdownRow, { label: "Standard Deduction", value: formatCurrency(result.comparison.new.standardDeduction) }),
                h(BreakdownRow, { label: "Other Deductions", value: formatCurrency(result.comparison.new.totalDeductions) }),
                h(BreakdownRow, { label: "Taxable Income", value: formatCurrency(result.comparison.new.taxableIncome) }),
                h(BreakdownRow, { label: "Tax Payable", value: formatCurrency(result.comparison.new.totalTax) })
              )
            ),
            h(
              "div",
              { className: "glass-panel rounded-[32px] p-6 sm:p-7" },
              h("h3", { className: "text-xl font-extrabold text-stone-900" }, "Tax-Saving Drivers"),
              h(
                "div",
                { className: "mt-4 flex flex-wrap gap-2" },
                result.insights.savingsLevers.length
                  ? result.insights.savingsLevers.map(function (lever) {
                      return h(Pill, {
                        key: lever.label,
                        label: lever.label,
                        value: formatCurrency(lever.amount),
                      });
                    })
                  : h("p", { className: "text-sm leading-6 text-stone-600" }, "No active exemptions or deductions are reducing your tax right now.")
              ),
              h("div", { className: "mt-5 rounded-[28px] bg-stone-950 p-5 text-stone-50" },
                h("div", { className: "text-xs font-bold uppercase tracking-[0.24em] text-stone-400" }, "Suggestion Engine"),
                result.insights.suggestions.length
                  ? result.insights.suggestions.map(function (item, index) {
                      return h("p", { key: index, className: "mt-3 text-sm leading-6 text-stone-200" }, item);
                    })
                  : h("p", { className: "mt-3 text-sm leading-6 text-stone-200" }, "Your salary structure is already using the major tax-saving levers captured in this calculator.")
              )
            ),
            (result.validation.errors.length || result.validation.warnings.length)
              ? h(
                  "div",
                  { className: "glass-panel rounded-[32px] p-6 sm:p-7" },
                  h("h3", { className: "text-xl font-extrabold text-stone-900" }, "Validation Checks"),
                  result.validation.errors.map(function (message, index) {
                    return h(
                      "div",
                      {
                        key: "error-" + index,
                        className: "mt-4 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700",
                      },
                      message
                    );
                  }),
                  result.validation.warnings.map(function (message, index) {
                    return h(
                      "div",
                      {
                        key: "warning-" + index,
                        className: "mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700",
                      },
                      message
                    );
                  })
                )
              : null,
            h(
              "div",
              { className: "glass-panel rounded-[32px] p-6 sm:p-7" },
              h("h3", { className: "text-xl font-extrabold text-stone-900" }, "Rule Notes"),
              h(
                "ul",
                { className: "mt-4 space-y-3 text-sm leading-6 text-stone-600" },
                h("li", null, "New regime for FY 2025-26 uses the Rs 75,000 standard deduction and the Rs 12 lakh rebate threshold, with marginal relief."),
                h("li", null, "Old regime keeps the Rs 50,000 standard deduction and allows salary exemptions plus Chapter VI-A deductions."),
                h("li", null, "This calculator treats all amounts as annual values and focuses on salaried income without special-rate income such as capital gains."),
                h("li", null, h("a", { href: "/image-compressor", className: "font-bold text-teal underline decoration-teal/30 underline-offset-4" }, "Previous image compressor screen"), " is still available on its own route.")
              )
            )
          )
        )
      )
    );
  }

  const root = ReactDOMLib.createRoot(document.getElementById("root"));
  root.render(h(App));
})();
