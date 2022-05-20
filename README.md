# `lu`
**`lu`** is an extended syntax for Lua that makes it easy to write components with `isu`, [a minimal and lightweight reactive framework for building user interfaces in the Roblox engine.](https://github.com/ccreaper/isu) It compiles to standard Lua code, and can be configured to work with more than just `isu`, including Roact.

## `lu` is still being drafted.
**`lu` is currently in the draft stage.** The choice of language, runtime and the extent of the scope is still being determined, but a TypeScript-based utility is likely to be selected. A functional build should be made available in the coming weeks. These are the features `lu` should have:
- JSX-like expressions for `isu` component trees that can easily interweave with Lua and passes down special properties to the `isu` instantiators, such as the `_text` property for markup-style text nodes, or the `_children` property for subcomponent construction.
- Minor QoL extensions to the Lua syntax that doesn't take too much effort to compile down to Lua, such as the JavaScript-like `import` syntax which can be optimized depending on the imported source code.
- Passthrough Luau syntax, meaning Luau syntax is supported but not considered during compilation.
- Compilation options setup through a `luconfig.json` file.

## Examples
### Example 1: Simple counter with file and intrinsic import.
The first code sample should compile to the second code sample.
```lua
import { Instances } from '@roblox' -- Intrinsinc imports start with '@'. They are only used by the compiler.
import { useState, useEvent, component } from './isu.min.lua' -- File imports are stitched automatically into the result script unless specified otherwise.
import someSubModule from script:WaitForChild('childModule') -- Expression imports convert to standard requires.

local counter = component(function(props)
    local count, setCount = useState(props.initialValue)
    
    useEvent('MouseButton1Click', function()
        setCount(count + 1)
    end)

    return (
        <Instances.TextButton>
            Clicks: {count}
        </Instances.TextButton>
    )
end)

(<counter initialValue={tick()}/>)().Parent = ...
```

**lu automatically stitches all locally-imported files into the script** unless specified otherwise in the `luconfig.json`. We obviously will not include `isu` in the example, but just imagine that it is there.
```lua
local _isu_min_lua = {--[[imported library rolled up here]]}
local useState, useEvent, component = _isu_min_lua.useState, _isu_min_lua.useEvent, _isu_min_lua.component
local someSubModule = require(script:WaitForChild('childModule'))

local counter = component(function(props)
    local count, setCount = useState(props.initialValue)
    
    useEvent('MouseButton1Click', function()
        setCount(count + 1)
    end)

    return ('TextButton'), ({
        Text = ('Clicks') .. (count)
    })
end)

(counter({initialValue=tick()}))().Parent = ...
```
### Example 2: Simple label with support for text nodes.
```lua
import { Instances } from '@roblox'
import { useState, useEvent, component } from './isu.min.lua'

local function label = component(function(props)
    return <Instances.TextLabel>{props._text}</Instances.TextLabel>
end)

(<label>Hello world!</label>)().Parent = ...
```
Compiles into...
```lua
local useState, useEvent, component = _isu_min_lua.useState, _isu_min_lua.useEvent, _isu_min_lua.component

local function label = component(function(props)
    return 'TextLabel', {
        Text = props._text
    }
end)

(label({_text='Hello world!'}))().Parent = ...
```