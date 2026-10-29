export interface FlowLink {
  label: string;
  nodeId: string;
}

export interface FlowNode {
  id: string;
  title: string;
  summary: string;
  detail: string;
  section: string;
  choices?: string[];
}

export interface FlowView {
  id: string;
  label: string;
  title: string;
  intro: string;
  section?: string;
  lanes: { title: string; caption: string; nodes: FlowNode[] }[];
  bridge: string;
  shared: FlowNode[];
  outcomes?: {
    title: string;
    text: string;
    nodes?: FlowNode[];
    links?: FlowLink[];
  }[];
  after?: FlowNode[];
  mergeLabel?: string;
  feedback: string;
  feedbackLinks?: FlowLink[];
}
