local function myComponent()
  return Roact.createElement(Component, {
    ["a"] = true;
    ["b"] = (2 + 3)
  }, {
    ["_0"] = Roact.createElement("bruhComponent", {}, {})
  })
end