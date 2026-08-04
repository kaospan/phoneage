import { TutorialOverlay } from "@/components/TutorialOverlay";
import { TUTORIAL_DEFINITIONS } from "@/lib/tutorials/tutorialDefinitions";

// Throwaway preview page for manually verifying TutorialOverlay changes. Not linked from
// anywhere in the app; remove alongside the route once verification is done.
export default function DevPreviewTutorial() {
  const basics = TUTORIAL_DEFINITIONS.find((t) => t.id === "basics")!;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#111" }}>
      <TutorialOverlay queue={[basics]} onDone={() => {}} />
    </div>
  );
}
