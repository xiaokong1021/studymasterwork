import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import type { ReasoningLevel } from "../../shared/types";

export function modelLabel(id: string) {
  return id.replace(/^deepseek/i, "DeepSeek").replace(/-v(\d)/i, "-V$1")
    .replace(/-flash/i, "-Flash").replace(/-pro/i, "-Pro");
}

export function ModelPicker({ models, modelId, reasoning, onModel, onReasoning, disabled }: {
  models: string[];
  modelId: string;
  reasoning: ReasoningLevel;
  onModel: (id: string) => void;
  onReasoning: (level: ReasoningLevel) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"root" | "models" | "reasoning">("root");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const returnTo = useRef<"models" | "reasoning">("models");
  const id = useId();
  const level = reasoning === "high" ? "High" : "Off";

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  const back = () => setPanel("root");
  const enter = (next: "models" | "reasoning") => {
    returnTo.current = next;
    setPanel(next);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !menu.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = menu.current.getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 12)),
        top: Math.max(12, anchor.top - bounds.height - 8),
      });
    };
    place();
    const target = panel === "root"
      ? menu.current?.querySelector<HTMLButtonElement>(`[data-section="${returnTo.current}"]`)
      : menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (target ?? menu.current?.querySelector<HTMLButtonElement>("button"))?.focus();
    const resize = new ResizeObserver(place);
    if (menu.current) resize.observe(menu.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, panel]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
        (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (panel !== "root") back(); else close(true);
    } else if (event.key === "ArrowRight" && panel === "root") {
      event.preventDefault();
      (document.activeElement as HTMLButtonElement)?.click();
    } else if (event.key === "Tab") {
      // Restore the trigger before the browser moves to the next toolbar control.
      close(true);
    }
  };

  return <>
    <button ref={trigger} type="button" className={`model-trigger ${open ? "is-open" : ""}`}
      aria-label={`模型与推理设置：${modelLabel(modelId)} ${level}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      disabled={disabled} onClick={() => { setPanel("root"); returnTo.current = "models"; setOpen(!open); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault(); setPanel("root"); setOpen(true);
        }
      }}>
      <span className="model-trigger-name" title={modelId}>{modelLabel(modelId)}</span>
      <span className="model-trigger-level">{level}</span>
      <ChevronUp size={13} aria-hidden="true" />
    </button>
    {open && createPortal(
      <div ref={menu} id={id} role="menu" aria-label={panel === "root" ? "模型与推理设置" : panel === "models" ? "选择模型" : "选择推理等级"}
        className="model-menu" style={position} onKeyDown={keyboard}>
        {panel === "root" ? <>
          <button type="button" role="menuitem" className="model-menu-row" data-section="models" aria-haspopup="menu" onClick={() => enter("models")}>
            <span>模型</span><span className="model-menu-value" title={modelId}>{modelLabel(modelId)}</span><ChevronRight size={15} aria-hidden="true" />
          </button>
          <button type="button" role="menuitem" className="model-menu-row" data-section="reasoning" aria-haspopup="menu" onClick={() => enter("reasoning")}>
            <span>推理等级</span><span className="model-menu-value">{level}</span><ChevronRight size={15} aria-hidden="true" />
          </button>
        </> : <>
          <button type="button" role="menuitem" className="model-menu-back" onClick={back}>
            <ChevronLeft size={15} aria-hidden="true" />{panel === "models" ? "模型" : "推理等级"}
          </button>
          <div className="model-menu-options" role="group">
            {panel === "models" ? models.map((model) =>
              <button key={model} type="button" role="menuitemradio" aria-checked={modelId === model} className="model-menu-option"
                onClick={() => { onModel(model); back(); }}>
                <span>{modelLabel(model)}</span>{modelId === model && <Check size={15} aria-hidden="true" />}
              </button>) : ([
                { id: "off", label: "Off", detail: "快速回答" },
                { id: "high", label: "High", detail: "深度思考" },
              ] as const).map((option) =>
                <button key={option.id} type="button" role="menuitemradio" aria-checked={reasoning === option.id} className="model-menu-option"
                  onClick={() => { onReasoning(option.id); back(); }}>
                  <span>{option.label}<small>{option.detail}</small></span>{reasoning === option.id && <Check size={15} aria-hidden="true" />}
                </button>)}
          </div>
        </>}
      </div>, document.body)}
  </>;
}
