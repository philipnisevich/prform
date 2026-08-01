import { SiGithub, SiLinear } from "react-icons/si";
import { FaSlack } from "react-icons/fa";
import { Building2 } from "lucide-react";
import type { IconType } from "react-icons";

export type SourceId = "slack" | "github" | "linear" | "crm";

export const SOURCE_META: Record<
  SourceId,
  { label: string; recordType: string; color: string; Icon: IconType | typeof Building2 }
> = {
  slack: { label: "Slack", recordType: "Slack message", color: "#611f69", Icon: FaSlack },
  github: { label: "GitHub", recordType: "GitHub activity", color: "#181717", Icon: SiGithub },
  linear: { label: "Linear", recordType: "Linear ticket", color: "#5e6ad2", Icon: SiLinear },
  crm: { label: "CRM", recordType: "CRM activity note", color: "#0369a1", Icon: Building2 },
};
