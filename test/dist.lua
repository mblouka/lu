local __LU_REQUIRE, __LU_UNPACK, __LU_IMPORT_CACHE = require, (unpack or table.unpack), {}
local __LU_IMPORT_TABLE = {
    ["src/mod"] = function()

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
local mod = require("src/mod")
local a = 341
print(a)