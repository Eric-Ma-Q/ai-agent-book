-- Wrap Vietnamese experiment and reflection sections in tcolorboxes.

function Pandoc(document)
  local blocks = {}
  local in_box = false
  local box_type = ""
  local box_level = 0

  local function open_box(name)
    table.insert(blocks, pandoc.RawBlock("latex", "\\begin{" .. name .. "}"))
    in_box = true
    box_type = name
  end

  local function close_box()
    table.insert(blocks, pandoc.RawBlock("latex", "\\end{" .. box_type .. "}"))
    in_box = false
    box_type = ""
  end

  for _, block in ipairs(document.blocks) do
    if block.t == "Header" then
      local text = pandoc.utils.stringify(block)
      if text:match("^Thí nghiệm%s?%d") then
        if in_box then close_box() end
        box_level = block.level
        block.classes:insert("unnumbered")
        open_box("experimentbox")
        table.insert(blocks, block)
      elseif text:match("^Câu hỏi tư duy") then
        if in_box then close_box() end
        box_level = block.level
        block.classes:insert("unnumbered")
        open_box("questionbox")
        table.insert(blocks, block)
      elseif in_box then
        if box_type == "experimentbox" or block.level <= box_level then
          close_box()
        end
        table.insert(blocks, block)
      else
        table.insert(blocks, block)
      end
    else
      table.insert(blocks, block)
    end
  end

  if in_box then close_box() end
  document.blocks = blocks
  return document
end
