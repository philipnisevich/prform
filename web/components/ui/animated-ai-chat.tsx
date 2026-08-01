"use client";

import { useEffect, useRef, useCallback } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, SendIcon, LoaderIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as React from "react";

// Adapted from a community "animated AI chat" component. Stripped for this
// use case: no file attachments, no slash-command palette, no simulated AI
// response — those were built for a chat-with-an-assistant product, not a
// manager-review search box. What's kept is the interaction shape (glassy
// auto-resizing input, ambient background blooms, animated quick-action
// row) recolored to the site's cream/green palette and rewired so the
// quick-action row is the three reviewed people, each pulling up their real
// report instead of inserting a canned command.

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }
      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY));
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { textareaRef, adjustHeight };
}

export interface PersonShortcut {
  name: string;
  id: string;
}

interface AnimatedAIChatProps {
  people: PersonShortcut[];
  onSelectPerson: (id: string) => void;
  // Free-text submissions (typed name, or a natural-language question the
  // exact-name shortcuts don't cover) go here — the parent tries an exact
  // match first and falls back to the AI query route for anything else.
  onQuery: (query: string) => void;
  selectedId: string | null;
  loading?: boolean;
}

export function AnimatedAIChat({ people, onSelectPerson, onQuery, selectedId, loading }: AnimatedAIChatProps) {
  const [value, setValue] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 56, maxHeight: 160 });

  const submitSearch = () => {
    const query = value.trim();
    if (!query) return;
    onQuery(query);
    setValue("");
    adjustHeight(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitSearch();
    }
  };

  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute top-0 left-1/4 h-72 w-72 rounded-full bg-accent/[0.06] blur-[96px]" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-accent/[0.05] blur-[96px]" />
      </div>

      <motion.div
        className="relative rounded-2xl border border-border bg-surface/80 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.18)] backdrop-blur-xl"
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Search a name, or pick a report below…"
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent px-1 py-1 text-[15px] text-text",
              "placeholder:text-muted focus:outline-none",
            )}
            // globals.css sets a site-wide :focus-visible outline outside any
            // Tailwind layer, which wins over the focus:outline-none utility
            // above regardless of source order — only an inline style beats it.
            style={{ outline: "none" }}
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            {people.map((p, index) => {
              const active = selectedId === p.id;
              return (
                <motion.button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPerson(p.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition",
                    active
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-surface text-muted hover:text-text",
                  )}
                >
                  <span>{p.name}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </motion.button>
              );
            })}
          </div>

          <motion.button
            type="button"
            onClick={submitSearch}
            whileTap={{ scale: 0.97 }}
            disabled={!value.trim()}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
              value.trim() ? "bg-text text-white" : "bg-surface-2 text-muted",
            )}
          >
            {loading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
          </motion.button>
        </div>
      </motion.div>

      {inputFocused && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-accent/25"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </div>
  );
}
