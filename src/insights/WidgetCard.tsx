import { useState, type ReactNode } from "react";
import { Box, IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutline";
import WidthFullRoundedIcon from "@mui/icons-material/WidthFullRounded";
import WidthNormalRoundedIcon from "@mui/icons-material/WidthNormalRounded";
import { useTokens } from "../context/ColorModeContext";
import type { WidgetInstance } from "./types";

export default function WidgetCard({ instance, canConfigure = true, onConfigure, onToggleSize, onRemove, children }: {
  instance: WidgetInstance;
  canConfigure?: boolean;
  onConfigure: () => void;
  onToggleSize: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { colors, shadow } = useTokens();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.id });
  const [menuEl, setMenuEl] = useState<null | HTMLElement>(null);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: instance.size === "full" ? "1 / -1" : undefined,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <Box ref={setNodeRef} style={style} sx={{
      position: "relative",
      "&:hover .widget-controls": { opacity: 1, pointerEvents: "auto" },
    }}>
      {/* Floating control pill at the top-left corner, hanging just above the card edge — clear of the
          chart/tooltip and of the widgets' own right-side toggles. */}
      <Box className="widget-controls" sx={{
        position: "absolute", top: -14, left: 12, zIndex: 15,
        display: "flex", alignItems: "center", gap: 0.25,
        px: 0.25, py: 0.15, borderRadius: 999,
        bgcolor: colors.white, border: `1px solid ${colors.gray200}`, boxShadow: shadow.md,
        opacity: menuEl ? 1 : 0, pointerEvents: menuEl ? "auto" : "none",
        transition: "opacity 0.15s ease",
      }}>
        <IconButton size="small" {...attributes} {...listeners} sx={{ cursor: "grab", color: colors.gray400, "&:active": { cursor: "grabbing" } }} aria-label="Drag to reorder">
          <DragIndicatorRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <IconButton size="small" onClick={e => setMenuEl(e.currentTarget)} sx={{ color: colors.gray500 }} aria-label="Widget options">
          <MoreVertRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {canConfigure && (
          <MenuItem onClick={() => { setMenuEl(null); onConfigure(); }}>
            <ListItemIcon><TuneRoundedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Configure</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { setMenuEl(null); onToggleSize(); }}>
          <ListItemIcon>{instance.size === "full" ? <WidthNormalRoundedIcon fontSize="small" /> : <WidthFullRoundedIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>{instance.size === "full" ? "Make half width" : "Make full width"}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setMenuEl(null); onRemove(); }} sx={{ color: colors.error }}>
          <ListItemIcon><DeleteOutlineRoundedIcon fontSize="small" sx={{ color: colors.error }} /></ListItemIcon>
          <ListItemText>Remove</ListItemText>
        </MenuItem>
      </Menu>

      {/* Fill the grid cell so row-mates match height; ring highlights the drop target when dragging. */}
      <Box sx={{ borderRadius: 3, outline: isDragging ? `2px solid ${alpha(colors.brand, 0.5)}` : "none", height: "100%", "& > *": { height: "100%" } }}>
        {children}
      </Box>
    </Box>
  );
}
