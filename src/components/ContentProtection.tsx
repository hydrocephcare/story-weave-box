import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Site-wide copy protection: blocks text selection/copy/cut, right-click and
 * drag-saving of images, and the common "print the page to get a clean PDF"
 * shortcut. Form fields stay fully usable.
 */
export default function ContentProtection() {
  const { isAdmin } = useAuth();
  useEffect(() => {
    if (isAdmin) {
      document.body.classList.remove("no-copy");
      return;
    }
    const isEditable = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node || !node.closest) return false;
      return !!node.closest("input, textarea, select, [contenteditable='true'], [data-allow-copy='true']");
    };

    const blockCopy = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    };
    const blockContext = (e: MouseEvent) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    };
    const blockDrag = (e: DragEvent) => {
      const node = e.target as HTMLElement | null;
      if (node && node.tagName === "IMG") e.preventDefault();
    };
    const blockKeys = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "p", "s", "u"].includes(key)) e.preventDefault();
    };

    document.addEventListener("copy", blockCopy);
    document.addEventListener("cut", blockCopy);
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("dragstart", blockDrag);
    document.addEventListener("keydown", blockKeys);
    document.body.classList.add("no-copy");

    return () => {
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("cut", blockCopy);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("dragstart", blockDrag);
      document.removeEventListener("keydown", blockKeys);
      document.body.classList.remove("no-copy");
    };
  }, [isAdmin]);

  return null;
}