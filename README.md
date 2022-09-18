# `lu`

**`lu` is an extended syntax for Lua that aims to implement quality-of-life features for the Lua 5.1 programming language.** Lua is very compact and comfortable to write, but it notably lacks certain features that are often ubiquitous in other languages, such as a standard module/package protocol, reflective features (attributes), compound operators, and pre-processing features (macros), among many other things.

**`lu` strives to fix these missing conveniences first and foremost.** Every single feature added no matter how significant is always compiled down to fully valid Lua code that relies exclusively on standard runtime (5.1) functions.

**`lu` also implements JSX syntax support.** This is the only "big" feature `lu` implements. This means [JSX-style](https://reactjs.org/docs/introducing-jsx.html) element composition can be written alongside Lua code and subsequently fed into libraries such as [`isu`](https://github.com/ccrpr/isu) or [Roact](https://github.com/Roblox/roact). Here's an example of such an application with `isu2` (currently unreleased), featuring JSX, attributes, and pipe anonymous functions:
```lua
local isu2 = require("isu2")
local useState, useEvent, Component = isu2.useState, isu2.useEvent, isu2.Component

@Component local function Counter()
    local clicks, setClicks = useState(0)

    useEvent('MouseButton1Click', 
        |input| setClicks(clicks + 1))

    return 'TextButton', {
        Size = UDim2.new(0, 100, 0, 100),
        Text = clicks .. ' clicks'
    }
end
```

**`lu`** was designed with `isu` in mind, [a minimal and lightweight reactive framework for building user interfaces in the Roblox engine.](https://github.com/ccreaper/isu) If you are looking for a compact alternative to your reactive component library, then I suggest you try it out. That said, `lu` can be configured to work with any stateful component-based library, so there's no vendor lock-in.

***

## `lu` is still in heavy construction
**`lu` is currently out of the draft stage and is currently in heavy construction.**  These are the features `lu` should have:
- [x] JSX-like expressions for `isu` component trees that can easily interweave with Lua and passes down special properties to the `isu` instantiators, such as the `_text` property for markup-style text nodes, or the `_children` property for subcomponent construction.
  - [x] JSX expression support and rendering to Lua 5.1 calls through `h` (configurable through `luconfig.json`).
  - [x] Lua expressions in blocks and parameters.
  - [ ] Text node support.
- [x] Minor QoL extensions to the Lua syntax that doesn't take too much effort to compile down to Lua.
  - [x] Reflective variable and function decorators through the `@decorator` and `@decorator(...)` syntax.
  - [x] Single-expression anonymous functions through Ruby-like pipe operators.
  - [ ] Assignments can be included in expressions. 
  - [x] Compound operators (such as `+=` and `..=`).
    - Unlike Luau, these can be part of an expression!
  - [ ] Full-body function declarations in tables.
  - [ ] `import` and `export` statements à la ES6.
- [x] Script pre- and post- processing.
  - [x] Transformation passes for compiling `lu` syntax into Lua 5.1 syntax.
  - [ ] Macros through the `!` designator.
  - [ ] Passthrough Luau support, meaning Luau syntax is supported but not considered during compilation.
  - [ ] Roll-up of `import` and `require` statements (bundling).
- [ ] Language server for integration with IDEs based on [`luau-lsp`](https://github.com/JohnnyMorganz/luau-lsp).
  - [ ] Visual Studio Code extension. This will be prioritized.
- [x] Compilation options setup through a `luconfig.json` file.

## Examples

### **Assignments**
The behavior of Lua assignments is modified in `lu`. Any assignment can now be included in an expression, with the final value taking place. This is a small change, but can result in much smaller code:
```lua
do -- Old way.
    local x, xmut = 4
    xmut = x * 2
    passValueToFunction(xmut)
end

do -- New way.
    local x, xmut = 4
    passValueToFunction(xmut = x * 2)
end
```

### **Attributes**
There are certain scenarios that require additional features to support annotating or modifying variable and function declarations. **Attributes** provide a way to add both annotations and a meta-programming syntax for variable and functions declarations without being too intrusive or disrespectful to Lua syntax.

An attribute is essentially a function that receives information about the variables or functions it's decorating. Attributes can be applied to three constructs: local variable declarations, local function declarations, and normal function declarations. 
- When you're decorating a local variable declaration with an attribute, then each individual variable's descriptor table will be passed as an argument to the attribute, with each descriptor containing a `name` field reflecting the local's name, a `get` function that can be called to retrieve the local's current value, and a `set` function that can be used to set the local's value. **To set a local's value, just its `set` function within its descriptor.**
- When you're decorating a function declaration, then the attribute will be invoked with the function's signature (its path/name and arguments in this format: `path.to.function(arg1, arg2, ...)`) and the actual function itself, which can be stored anywhere and called arbitrarily. The return value will be the final value stored in the variable, which means returning `nil` erases the function altogether. **To set the function's value, return what you want to set.**
- **All attributes can accept extra arguments.** They are passed first, with any reflection data passed afterwards.

 Let's look at an example with local variables:
```lua
local function myAttribute(var1, var2, ...)
    print(var1.name, var2.name) -- Print their names.
    print(var1.get(), var2.get()) -- Print their values.
    var1.set(var1.get() * 2) -- Double var1's value.
    var2.set(var2.get() * 2) -- Ditto with var2.
    print(...) -- Print any further declarations, if any.
end

@myAttribute
local a, b = 3, 6

print(a, b) -- Should print 6, 12 due to the mutations above.
```

Here's how they work with function declarations:
```lua
local function myAttribute(funcname, func)
    print(funcname) -- Print function signature and arguments.
    print(func) -- Print the function object.
    return function(...)
        print(...) -- Print the passed arguments.
        return func
    end
end

@myAttribute
local function myFunction(a, b)
    return a * b
end
```

As mentioned above, attributes can also accept arguments. This is how it works, retaking the function declaration example:
```lua
local function myAttribute(extraarg, otherarg, funcname, func)
    print(extraarg + otherarg) -- Print both passed arguments.
    return func -- Rest of arguments are passed.
end

@myAttribute(3, 6)
local function myFunction(a, b)
    return a * b
end
```

### **Anonymous pipe functions**
Lua currently has no shorthand syntax for single-expression functions, whereas many other languages do. JavaScript has [arrow functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions), C# has [lambdas](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/lambda-operator), and even C++ has a (relatively weird) [lambda expression](https://learn.microsoft.com/en-us/cpp/cpp/lambda-expressions-in-cpp?view=msvc-170) syntax. In Lua, you have to declare an entire function block and include a whole return statement in order to describe a single expression. `lu` fixes this by including a Ruby-inspired syntax for anonymous, single-expr functions:
```lua
local anon = |a, b| a * b
print(anon(2, 4)) -- Prints "8".
```

Anonymous pipe functions can be passed anywhere a function is accepted, such as an argument:
```lua
local x = { 1, 2, 4, 8, 16, 32, 64 }
table.foreach(x, |k, v| x[k] = v * 2)
```

### **Full body functions in tables**
Including a function in a table in Lua has to be done through the anonymous function syntax. In `lu`, you can use the full function declaration syntax in tables, which can be more comfortable to read.
```lua
-- Old way.
local t = {
    func = function(a, b)
        return a * b
    end
}

-- New way.
local t = {
    function func(a, b)
        return a * b
    end
}
```

### **`import` and `export`**
In Lua, there is no protocol or standard established for transferring values in and out of scripts. Usually, you have to return a table from your script containing your values, and reading the values from the received value can look ugly. In `lu`, `import` and `export` is available to streamline this process.

**`module.lua`**
```lua
-- Old way.
-- Functions must be local to avoid environment pollution,
-- and a table must be returned.
local function add(a, b)
    return a + b
end

local function sub(a, b)
    return a - b
end

return { add = add, sub = sub }

-- New way.
-- No need for local or a return statement!
export function add(a, b)
    return a + b
end

export function sub(a, b)
    return a - b
end
```

**`consumer.lua`**
```lua
-- Old way.
local module = require("module")
local add, sub = module.add, module.sub
print(add(1, 2), sub(3, 2))

-- New way.
import { add, sub } from "module"
print(add(1, 2), sub(3, 2))

-- You can also import everything with a default import.
import module from "module"
print(module.add(1, 2), module.sub(3, 2))
```

**The `export` syntax assumes you are not already returning something.** `lu` will error if you are using exports in your script(s) and a global `return` statement is found.

**The `import` syntax works with any Lua script.** It assumes the required script returns a table that can be indexed with the provided keys in brackets. As most Lua scripts follow this behavior, `import` should be compatible with mostly everything. That said, `require` is always available if `import` fails for some reason!

### **Macros**
Lua does not offer a preprocessor. In `lu`, we offer a `C`/`C++`-style preprocessor through the `!` designator, including function-style macros. Here's an example:
```lua
!some_macro(a, b) (a * b)
!inline_macro "yep"

print(some_macro(8, 12)) -- This is replaced by "print((8 * 12))".
print(inline_macro .. "hi") -- This becomes "print("yep" .. "hi")".
```

**Unlike `C`/`C++`, our macros does not require a line continuation symbol for multiline behavior.** Simply use `<!` and `!>` as the start and end of your macro block.
```lua
!some_macro(a, b) <!
    local c = a * b
    print(c)
!>

!inline_macro <!
    "hello world" .. [[
        multiline string
    ]]
!>

some_macro(8, 12, inline_macro)
```

### **JSX**
As previously mentioned, `lu`'s biggest addition is the inclusion of support for JSX-like syntax. This is meant to be used in combination with component libraries such as `isu` or Roact. The way this works is by translating all element constructors into `h(element, parameters, ...)` calls in the compiler, very similarly to how JSX compilation works in `tsc`/Babel (and most bundlers in the JavaScript ecosystem). Here's an example:
```lua
-- This structure...
local x = <MyComponent prop1="hi" prop2={"a".."b"} propbool>
    hello
    <Subcomponent short="yes" />
    world
</MyComponent>

-- ...is compiled into this.
local x = h(myComponent, {
    prop1 = "hi",
    prop2 = ("a" .. "b"),
    propbool = true
}, "hello", h(SubComponent, { short = "yes" }), "world")
```

The function it compiles to can be configured in `luconfig.json`. 