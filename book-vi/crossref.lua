-- Internal cross-reference links for the Vietnamese edition.
--
-- Keeps the manual Hình N-M / Chương N wording while adding clickable LaTeX
-- anchors without depending on LaTeX figure counters.

local chapter = 0

local function figure_label(n, m) return "fig:" .. n .. "-" .. m end
local function chapter_label(n) return "chap:" .. n end

local function linkify(text)
  local output = {}
  local position = 1
  while position <= #text do
    local fs, fe, fn, fm = text:find("Hình%s*(%d+)%-(%d+)", position)
    local cs, ce, cn = text:find("Chương%s*(%d+)", position)
    local kind
    if fs and (not cs or fs <= cs) then kind = "figure"
    elseif cs then kind = "chapter" end
    if not kind then
      table.insert(output, pandoc.Str(text:sub(position)))
      break
    end
    local match_start = (kind == "figure") and fs or cs
    local match_end = (kind == "figure") and fe or ce
    if match_start > position then
      table.insert(output, pandoc.Str(text:sub(position, match_start - 1)))
    end
    if kind == "figure" then
      table.insert(output, pandoc.RawInline(
        "latex",
        "\\crossreflink{" .. figure_label(fn, fm) .. "}{Hình " .. fn .. "-" .. fm .. "}"
      ))
    else
      table.insert(output, pandoc.RawInline(
        "latex",
        "\\crossreflink{" .. chapter_label(cn) .. "}{Chương " .. cn .. "}"
      ))
    end
    position = match_end + 1
  end
  return output
end

return {
  {
    traverse = "topdown",

    Header = function(element)
      if element.level == 1 and not element.classes:includes("unnumbered") then
        chapter = chapter + 1
        element.content:insert(pandoc.RawInline(
          "latex", "\\label{" .. chapter_label(chapter) .. "}"
        ))
      end
      return element
    end,

    Figure = function(element)
      local caption = pandoc.utils.stringify(element.caption.long)
      local n, m = caption:match("Hình%s*(%d+)%-(%d+)")
      if n and m then element.identifier = figure_label(n, m) end
      return element, false
    end,

    Image = function(element)
      local caption = pandoc.utils.stringify(element.caption)
      local n, m = caption:match("Hình%s*(%d+)%-(%d+)")
      if n and m and element.identifier == "" then
        element.identifier = figure_label(n, m)
      end
      return element, false
    end,

    Str = function(element)
      if element.text:find("Hình") or element.text:find("Chương") then
        return linkify(element.text)
      end
    end,
  }
}
