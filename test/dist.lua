local function ArgumentsLogger(funcname, func)
  return function(...)
    print(("Arguments for " .. (funcname .. ": ")), ...)
    return func(...)
  end
end
local t_find
t_find = ArgumentsLogger("t_find(t, v)", function(t, v)
    for k, d in pairs(t) do
      if (type(d) == "table") then
        local vv = t_find(d, v)
        if vv then
          return vv
        end
      end
      if (v == d) then
        return d
      end
    end
  end)
local example = {1, 2, 3, {4, 5, 6}, 7, 8, 9}
t_find(example, 6)