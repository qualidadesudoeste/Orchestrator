export type BddKeyword = "DADO" | "QUANDO" | "ENTAO";

export type StepIntent =
  | "AUTHENTICATE"
  | "NAVIGATE"
  | "PRECONDITION"
  | "INTERACT"
  | "ASSERT"
  | "CAPTURE"
  | "UNKNOWN";

export type CompiledBddStep = {
  id: string;
  keyword: BddKeyword;
  text: string;
  sourceLine: string;
  line: number;
  intent: StepIntent;
};

export type CompiledScenario = {
  version: 2;
  language: string;
  feature: string;
  title: string;
  tags: string[];
  steps: CompiledBddStep[];
};

export type SkillAction =
  | "LOGIN"
  | "NAVIGATE"
  | "FILL_FORM"
  | "CLICK"
  | "CHECK"
  | "SEARCH"
  | "DOWNLOAD"
  | "ASSERT_VISIBLE"
  | "CAPTURE_VALUE"
  | "DISCOVER";

export type AutomationSkill = {
  id: string;
  name: string;
  action: SkillAction;
  patterns: RegExp[];
  priority: number;
  deterministic: boolean;
};

export type PreconditionState =
  | "READY"
  | "PROVISION_REQUIRED"
  | "DISCOVERY_REQUIRED"
  | "EXTERNAL_BLOCK";

export type StepResolution = {
  stepId: string;
  state: PreconditionState;
  skillIds: string[];
  availableDataKeys: string[];
  reason: string;
};

export type ExecutableScenarioPlan = {
  version: 2;
  scenario: CompiledScenario;
  mode: "DETERMINISTIC" | "HYBRID" | "DISCOVERY";
  resolutions: StepResolution[];
};
