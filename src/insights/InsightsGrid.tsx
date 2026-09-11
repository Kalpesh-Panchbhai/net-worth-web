import { useMemo, useState } from "react";
import {
  Box, Button, Fab, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Typography, Stack, CircularProgress, useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, rectSortingStrategy } from "@dnd-kit/sortable";
import { useUser } from "../context/UserContext";
import { useTokens } from "../context/ColorModeContext";
import { useInsightsData } from "./useInsightsData";
import { useInsightsLayout, newWidgetId } from "./storage";
import { WIDGET_META, WIDGET_ORDER, WidgetView } from "./registry";
import WidgetCard from "./WidgetCard";
import WidgetConfigForm from "./WidgetConfigForm";
import type { WidgetConfig, WidgetInstance, WidgetType } from "./types";

export default function InsightsGrid() {
  const { userId } = useUser();
  const { colors, shadow } = useTokens();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const data = useInsightsData();
  const [layout, setLayout, loaded] = useInsightsLayout(userId);

  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<WidgetType | null>(null);
  const [addDraft, setAddDraft] = useState<WidgetConfig | null>(null);
  const [editing, setEditing] = useState<WidgetInstance | null>(null);
  const [draft, setDraft] = useState<WidgetConfig | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => layout.map(w => w.id), [layout]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    setLayout(arrayMove(layout, from, to));
  };

  const closeAdd = () => { setAddOpen(false); setAddType(null); setAddDraft(null); };
  const finalizeAdd = (type: WidgetType, config: WidgetConfig) => {
    const size = type === "performance" || type === "income" ? "full" : "half";
    setLayout([...layout, { id: newWidgetId(), type, size, config }]);
    closeAdd();
  };
  // Pick a type: configurable widgets go to a config step; the rest are added straight away.
  const pickType = (type: WidgetType) => {
    const config = structuredClone(WIDGET_META[type].defaultConfig);
    if (WIDGET_META[type].configurable) { setAddType(type); setAddDraft(config); }
    else finalizeAdd(type, config);
  };
  const updateInstance = (id: string, patch: Partial<WidgetInstance>) => setLayout(layout.map(w => w.id === id ? { ...w, ...patch } : w));
  const removeInstance = (id: string) => setLayout(layout.filter(w => w.id !== id));

  if (!loaded) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
        <CircularProgress size={28} sx={{ color: colors.brand }} />
      </Box>
    );
  }

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {layout.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8, color: colors.gray400 }}>
          <Typography sx={{ fontSize: "0.9rem" }}>No widgets yet — add one to build your dashboard.</Typography>
        </Box>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            {/* stretch so half-width widgets sharing a row match the taller one's height */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: { xs: 2.5, sm: 3 }, alignItems: "stretch" }}>
              {layout.map(inst => (
                <WidgetCard
                  key={inst.id}
                  instance={inst}
                  canConfigure={WIDGET_META[inst.type].configurable}
                  onConfigure={() => { setEditing(inst); setDraft(structuredClone(inst.config)); }}
                  onToggleSize={() => updateInstance(inst.id, { size: inst.size === "full" ? "half" : "full" })}
                  onRemove={() => removeInstance(inst.id)}
                >
                  {/* Remount on config change so widgets that seed state from config pick up dialog
                      edits; the watchlist widget mutates config via its own chips, so keep it stable. */}
                  <WidgetView
                    key={inst.type === "watchlistComparison" ? inst.id : `${inst.id}:${JSON.stringify(inst.config)}`}
                    instance={inst} data={data} onConfigChange={config => updateInstance(inst.id, { config })}
                  />
                </WidgetCard>
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      )}

      {/* Add-widget flow: pick a type from a tile grid, then configure it before adding. */}
      <Dialog open={addOpen} onClose={closeAdd} fullWidth maxWidth={addType ? "xs" : "sm"}
        PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: addType ? 1 : 1.5 }}>
          {addType && (
            <IconButton size="small" onClick={() => { setAddType(null); setAddDraft(null); }} sx={{ ml: -0.5, color: colors.gray500 }} aria-label="Back">
              <ArrowBackRoundedIcon fontSize="small" />
            </IconButton>
          )}
          {addType ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 30, height: 30, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(colors.brand, 0.1), color: colors.brand, "& svg": { fontSize: 18 } }}>
                {WIDGET_META[addType].icon}
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>{WIDGET_META[addType].label}</Typography>
            </Stack>
          ) : (
            <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>Add a widget</Typography>
          )}
        </DialogTitle>

        <DialogContent>
          {addType && addDraft ? (
            <>
              <Typography sx={{ fontSize: "0.78rem", color: colors.gray500, mb: 0.5 }}>{WIDGET_META[addType].description}</Typography>
              <WidgetConfigForm type={addType} config={addDraft} data={data} onChange={setAddDraft} />
            </>
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, pt: 0.5 }}>
              {WIDGET_ORDER.map(type => {
                const meta = WIDGET_META[type];
                return (
                  <Box key={type} onClick={() => pickType(type)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") pickType(type); }}
                    sx={{
                      cursor: "pointer", p: 1.75, borderRadius: 3,
                      border: `1px solid ${colors.gray200}`, bgcolor: colors.white,
                      display: "flex", flexDirection: "column", gap: 0.75, position: "relative",
                      transition: "border-color .15s, background-color .15s, transform .15s, box-shadow .15s",
                      "&:hover": { borderColor: alpha(colors.brand, 0.5), bgcolor: alpha(colors.brand, 0.04), transform: "translateY(-2px)", boxShadow: shadow.md },
                      "& .go": { opacity: 0, transition: "opacity .15s" },
                      "&:hover .go": { opacity: 1 },
                    }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(colors.brand, 0.1), color: colors.brand, "& svg": { fontSize: 20 } }}>
                      {meta.icon}
                    </Box>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.88rem" }}>{meta.label}</Typography>
                    <Typography sx={{ fontSize: "0.73rem", color: colors.gray500, lineHeight: 1.4 }}>{meta.description}</Typography>
                    <ChevronRightRoundedIcon className="go" sx={{ position: "absolute", top: 12, right: 10, fontSize: 18, color: colors.brand }} />
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          {addType ? (
            <>
              <Button onClick={closeAdd} sx={{ color: colors.gray500 }}>Cancel</Button>
              <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => { if (addDraft) finalizeAdd(addType, addDraft); }}>Add widget</Button>
            </>
          ) : (
            <Button onClick={closeAdd} sx={{ color: colors.gray500 }}>Cancel</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Configure dialog */}
      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {editing && (
            <Box sx={{ width: 30, height: 30, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(colors.brand, 0.1), color: colors.brand, "& svg": { fontSize: 18 } }}>
              {WIDGET_META[editing.type].icon}
            </Box>
          )}
          <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>Configure {editing && WIDGET_META[editing.type].label}</Typography>
        </DialogTitle>
        <DialogContent>
          {editing && draft && (
            <WidgetConfigForm type={editing.type} config={draft} data={data} onChange={setDraft} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => { if (editing && draft) updateInstance(editing.id, { config: draft }); setEditing(null); }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Fab onClick={() => setAddOpen(true)}
        variant={isMobile ? "circular" : "extended"}
        sx={{
          position: "fixed",
          bottom: { xs: "calc(24px + env(safe-area-inset-bottom, 0px))", sm: 24 },
          right: { xs: 16, sm: 24 },
          bgcolor: colors.brand,
          color: colors.pureWhite,
          boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`,
          "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` },
        }}>
        <AddRoundedIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add widget"}
      </Fab>
    </Stack>
  );
}
