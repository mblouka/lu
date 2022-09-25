local value = 0
local function display(a, b)
  local x = (a + b)
  print(value, x)
end
display((function()
    value = (value + 5)
    return value
  end)(), (function()
    value = (value + 10)
    return value
  end)())