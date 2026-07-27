import { AssistantApp } from "@/components/assistant-ui/assistant-app";
import { UserSession } from "@/components/auth/user-session";

export default function Home() {
  return <AssistantApp authSlot={<UserSession />} />;
}
