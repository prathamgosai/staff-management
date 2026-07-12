"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./dialog";

/**
 * Accessible modal wrapper over the radix Dialog primitive, with the same simple
 * `open` / `onClose` API the app's hand-rolled `<div className="fixed inset-0">` modals
 * already use — so a page can swap its bespoke overlay for this with a minimal diff and
 * gain a focus trap, Escape-to-close, `aria-modal`, scroll-lock, and focus restoration
 * for free.
 *
 * Migration shape:
 *   before:  {isOpen && (<div className="fixed inset-0 z-50 ...">... form ...</div>)}
 *   after:   <Modal open={isOpen} onClose={close} title="…">... form ...</Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes for the content panel (e.g. a wider `sm:max-w-2xl`). */
  className?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
