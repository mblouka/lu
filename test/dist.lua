local __LU_REQUIRE, __LU_UNPACK, __LU_IMPORT_CACHE = require, (unpack or table.unpack), {}
local __LU_IMPORT_TABLE = {
    ["src/test-import"] = function()
      local function add(a, b)
        return (a + b)
      end
      local function mul(a, b)
        return (a * b)
      end
      return {
    ["add"] = add;
    ["mul"] = mul
  }
    end
  }
local require = function(input)
    local tryCache = __LU_IMPORT_CACHE[input]
    if tryCache then
      return __LU_UNPACK(tryCache)
    else
      local module = __LU_IMPORT_TABLE[input]
      if module then
        tryCache = {module()}
        __LU_IMPORT_CACHE[input] = tryCache
      else
        return __LU_REQUIRE(input)
      end
    end
    return __LU_UNPACK(tryCache)
  end
local __import0 = require("src/test-import")
local add, mul = __import0.add, __import0.mul
print((add(1, 3) + mul(2, 5)))