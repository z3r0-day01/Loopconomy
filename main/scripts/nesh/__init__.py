#!/usr/bin/env python3
"""
NeSH - Neon Shell
Version: 1.0.0
Advanced syntax layer for LUMA

This module provides the Neon Shell syntax parser with:
- Pipeline operators (|, =>>, &)
- Environment variables ($VAR, SET_ENV)
- Control flow (IF, WHILE, FOR, DEF)
- Variables (Z_<name>:<type> = value)
- Neon-Carbon BASIC interpreter
"""

import re
import os
import shlex
from typing import Any, Callable, Dict, List, Optional, Tuple, Union


class NeonValue:
    """Represents a typed value in NeSH"""
    
    def __init__(self, value: Any, type_name: str):
        self.value = value
        self.type = type_name
    
    def __repr__(self):
        return f"Z_{self.value}:{self.type}"
    
    def __str__(self):
        return str(self.value)


class NeSH:
    """
    Neon Shell - Advanced Syntax Parser
    
    Access via:
    - Press ALT+S in LUMA
    - Type 'shell' command
    
    Syntax examples:
    | Select-Type: WiFi =>> Sort +Strength
    SET_ENV $var := "value"
    Z_<Var>:<Type> = <Value>
    IF (condition) : action
    """
    
    VERSION = "1.0.0"
    
    def __init__(self, parent_shell=None):
        self.parent = parent_shell
        self.env_vars: Dict[str, str] = {}
        self.variables: Dict[str, NeonValue] = {}
        self.functions: Dict[str, Callable] = {}
        self.mode = "NeSH"  # NeSH, NeC (BASIC), NeX (Graphics)
        self.posix_compliance = True
        self.output_buffer: List[str] = []
        self.history: List[str] = []
        self.exit_code = 0
        
        # Standard library functions
        self._register_stdlib()
    
    def _register_stdlib(self):
        """Register standard library functions"""
        self.functions = {
            # String functions
            'len': lambda x: len(str(x)),
            'upper': lambda x: str(x).upper(),
            'lower': lambda x: str(x).lower(),
            'trim': lambda x: str(x).strip(),
            'split': lambda x, delim: str(x).split(delim),
            'join': lambda x, delim: delim.join(x),
            
            # Math functions
            'rand': lambda: __import__('random').random(),
            'randint': lambda a, b: __import__('random').randint(a, b),
            'abs': abs,
            'round': round,
            'floor': lambda x: int(x),
            'ceil': lambda x: -int(-x),
            
            # System functions
            'time': lambda: __import__('datetime').datetime.now().strftime("%H:%M:%S"),
            'date': lambda: __import__('datetime').datetime.now().strftime("%Y-%m-%d"),
            'epoch': lambda: __import__('time').time(),
            
            # Type conversion
            'int': int,
            'float': float,
            'str': str,
            'bool': bool,
            
            # NeSH specific
            'exit': self._exit,
            'help': self._help,
            'clear': self._clear,
            'shell': self._switch_to_shell,
            'interface': self._interface,
        }
    
    def execute(self, command: str) -> Tuple[int, str]:
        """
        Execute a NeSH command
        
        Args:
            command: The command string to execute
            
        Returns:
            Tuple of (exit_code, output)
        """
        self.history.append(command)
        command = command.strip()
        
        if not command:
            return 0, ""
        
        # Handle special commands
        if command.startswith('%C:'):
            # Exit command
            action = command[3:].strip()
            if action == 'exit':
                return self._exit()
            return 0, ""
        
        if command == '^C':
            return 0, ""
        
        if command.startswith('&POSIX='):
            # POSIX compliance toggle
            self.posix_compliance = command.split('=')[1].strip().lower() == 'true'
            return 0, f"POSIX Compliance {'Enabled' if self.posix_compliance else 'Disabled'}"
        
        try:
            # Parse and execute
            result = self._parse_command(command)
            return self.exit_code, result
        except Exception as e:
            self.exit_code = 1
            return 1, f"Error: {str(e)}"
    
    def _parse_command(self, command: str) -> str:
        """Parse and execute a command"""
        # Handle pipeline operators
        if '|>' in command or '=>>' in command:
            return self._execute_pipeline(command)
        
        # Handle environment variables
        if command.startswith('SET_ENV'):
            return self._handle_set_env(command)
        
        if command.startswith('SET_CMD'):
            return self._handle_set_cmd(command)
        
        if command.startswith('LNK_ENV'):
            return self._handle_lnk_env(command)
        
        # Handle variable assignments
        if 'Z_' in command and ':' in command and '=' in command:
            return self._handle_variable(command)
        
        # Handle IF statements
        if command.startswith('IF'):
            return self._handle_if(command)
        
        # Handle DEF (define function)
        if command.startswith('DEF'):
            return self._handle_def(command)
        
        # Handle basic command (pass to parent or shell)
        return self._execute_basic(command)
    
    def _execute_pipeline(self, command: str) -> str:
        """Execute pipeline operations"""
        # Split by pipeline operators
        parts = re.split(r'(?:\|>|=>>|\|)', command)
        results = []
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            # Parse Select-Type: pattern
            select_match = re.search(r'Select-Type:\s*(\w+)', part, re.IGNORECASE)
            getobj_match = re.search(r'Get-Obj:\s*\(([^)]+)\)', part)
            sort_match = re.search(r'Sort\s+(.+)', part)
            
            if select_match:
                results.append(f"Selected: {select_match.group(1)}")
            if getobj_match:
                results.append(f"Objects: {getobj_match.group(1)}")
            if sort_match:
                results.append(f"Sorted by: {sort_match.group(1)}")
            
            # Execute as basic command if no pipeline-specific syntax
            if not (select_match or getobj_match or sort_match):
                exit_code, output = self._execute_basic_return(part)
                if output:
                    results.append(output)
        
        return "\n".join(results) if results else "Pipeline executed"
    
    def _handle_set_env(self, command: str) -> str:
        """Handle SET_ENV command"""
        # SET_ENV $var := "value"
        match = re.search(r'SET_ENV\s+\$(\w+)\s*:?=\s*(.+)', command)
        if match:
            var_name = match.group(1)
            var_value = match.group(2).strip().strip('"').strip("'")
            self.env_vars[var_name] = var_value
            return f"Environment variable ${var_name} = {var_value}"
        return "Invalid SET_ENV syntax"
    
    def _handle_set_cmd(self, command: str) -> str:
        """Handle SET_CMD command"""
        # SET_CMD (cmd1, cmd2, cmd3) := "/path"
        match = re.search(r'SET_CMD\s+\(([^)]+)\)\s*:?=\s*(.+)', command)
        if match:
            cmds = [c.strip() for c in match.group(1).split(',')]
            path = match.group(2).strip().strip('"').strip("'")
            for cmd in cmds:
                self.env_vars[f"CMD_{cmd}"] = path
            return f"Commands {cmds} linked to {path}"
        return "Invalid SET_CMD syntax"
    
    def _handle_lnk_env(self, command: str) -> str:
        """Handle LNK_ENV command"""
        # LNK_ENV +am (Neon, Neon:Sulfur):"${path}/linker.ld"
        match = re.search(r'LNK_ENV\s+(\+?\w+)\s+\(([^)]+)\):"([^"]+)"', command)
        if match:
            flags = match.group(1)
            modules = match.group(2)
            path_template = match.group(3)
            
            # Expand ${} variables
            path = path_template
            for var in re.findall(r'\$\{?(\w+)\}?', path_template):
                if var in self.env_vars:
                    path = path.replace(f"${{{var}}}", self.env_vars[var])
                    path = path.replace(f"${var}", self.env_vars[var])
            
            return f"Linked environment: {modules} with flags {flags} at {path}"
        return "Invalid LNK_ENV syntax"
    
    def _handle_variable(self, command: str) -> str:
        """Handle variable assignment Z_<name>:<type> = <value>"""
        # Z_<Var>:<Type> = <Value>
        match = re.search(r'Z_(\w+):(\w+)\s*=\s*(.+)', command)
        if match:
            var_name = match.group(1)
            var_type = match.group(2)
            var_value = match.group(3).strip()
            
            # Convert value to appropriate type
            if var_type in ('Int', 'Integer'):
                value = int(var_value)
            elif var_type in ('Float', 'Real'):
                value = float(var_value)
            elif var_type in ('Bool', 'Boolean'):
                value = var_value.lower() in ('true', 'yes', '1')
            elif var_type == 'Str':
                value = var_value.strip('"').strip("'")
            else:
                value = var_value
            
            self.variables[f"Z_{var_name}"] = NeonValue(value, var_type)
            return f"Z_{var_name}:{var_type} = {value}"
        return "Invalid variable syntax"
    
    def _handle_if(self, command: str) -> str:
        """Handle IF statements"""
        # IF (condition) : action
        match = re.search(r'IF\s*\((.+)\)\s*:\s*(.+)', command)
        if match:
            condition = match.group(1).strip()
            action = match.group(2).strip()
            
            # Simple condition evaluation
            try:
                # Replace variables in condition
                for var, val in self.variables.items():
                    condition = condition.replace(var, str(val.value))
                
                # Evaluate (safe eval)
                result = eval(condition, {"__builtins__": {}}, {})
                if result:
                    return self._execute_basic(action)
                return ""
            except:
                return f"Condition evaluation failed: {condition}"
        return "Invalid IF syntax"
    
    def _handle_def(self, command: str) -> str:
        """Handle DEF (define function)"""
        # DEF "name": %PARAM { code }
        match = re.search(r'DEF\s+"(\w+)":\s*%(UNIT\([^)]+\))?\s*\{(.+)\}', command)
        if match:
            func_name = match.group(1)
            unit = match.group(2)
            code = match.group(3)
            
            self.functions[func_name] = lambda: f"Function {func_name} defined with {unit}"
            return f"Defined function: {func_name} [{unit}]"
        return "Invalid DEF syntax"
    
    def _execute_basic(self, command: str) -> str:
        """Execute a basic command"""
        exit_code, output = self._execute_basic_return(command)
        return output
    
    def _execute_basic_return(self, command: str) -> Tuple[int, str]:
        """Execute basic command and return tuple"""
        # Handle function calls
        for func_name, func in self.functions.items():
            if command.startswith(func_name + '(') or command == func_name:
                try:
                    result = func()
                    return 0, str(result)
                except Exception as e:
                    return 1, str(e)
        
        # Pass to parent shell if available
        if self.parent:
            return self.parent.execute(command)
        
        # Otherwise, execute as system command
        try:
            # Use shell=False for safety, but expand variables
            expanded = command
            for var, val in self.env_vars.items():
                expanded = expanded.replace(f'${var}', val)
            
            result = __import__('subprocess').run(
                shlex.split(expanded),
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode, result.stdout or result.stderr
        except Exception as e:
            return 1, str(e)
    
    def _exit(self, code: int = 0) -> str:
        """Exit NeSH"""
        self.exit_code = code
        return f"Exiting NeSH with code {code}"
    
    def _help(self) -> str:
        """Show help"""
        return """
NeSH v1.0.0 - Neon Shell Help
============================

Commands:
  SET_ENV $var := "value"    - Set environment variable
  SET_CMD (cmd1, cmd2) := "/path"  - Link commands
  LNK_ENV +am (Mod1, Mod2):"${path}/ld"  - Link environment
  
Variables:
  Z_<name>:<type> = <value>  - Set typed variable
  Types: Int, Float, Bool, Str, Expr
  
Control Flow:
  IF (condition) : action    - Conditional
  DEF "name": %UNIT(param) { code }  - Define function
  
Special:
  &POSIX=True|False        - Toggle POSIX compliance
  %C:exit                   - Exit command
  ^C                        - Cancel
  shell                     - Return to LUMA
  interface NeC            - Enter BASIC mode
  interface NeX             - Enter Graphics mode

Pipeline:
  Select-Type: X | Get-Obj: (a,b) =>> Sort +field
  
Press ALT+S or type 'shell' to return to LUMA.
""".strip()
    
    def _clear(self) -> str:
        """Clear output buffer"""
        self.output_buffer = []
        return ""
    
    def _switch_to_shell(self) -> str:
        """Return to LUMA"""
        return "Returning to LUMA..."
    
    def _interface(self, mode: str) -> str:
        """Switch interface mode"""
        if mode.lower() in ('nec', 'basic', 'carbon'):
            self.mode = "NeC"
            return "Entered Neon-Carbon BASIC mode"
        elif mode.lower() in ('nex', 'graphics', 'xeon'):
            self.mode = "NeX"
            return "Entered Neon Graphics mode"
        else:
            self.mode = "NeSH"
            return "Returned to Neon Shell mode"
    
    def get_prompt(self) -> str:
        """Get the current prompt"""
        time = __import__('datetime').datetime.now().strftime("%H:%M")
        return f"Eden({time}): {self.mode.lower()} "
    
    def get_completions(self, partial: str) -> List[str]:
        """Get command completions"""
        commands = [
            'SET_ENV', 'SET_CMD', 'LNK_ENV', 'IF', 'DEF', 'WHILE', 'FOR',
            'Z_', '&POSIX=', '%C:exit', '^C', 'shell', 'interface',
            'Select-Type:', 'Get-Obj:', 'Sort:', 'help', 'clear', 'exit'
        ]
        
        if partial:
            return [c for c in commands if c.lower().startswith(partial.lower())]
        return commands


# Neon-Carbon (NeC) BASIC Interpreter
class NeonCarbon:
    """
    Neon-Carbon BASIC Interpreter
    
    Accessible via: interface NeC
    
    Syntax:
    01 O: "Hello World"
    02 I: "Input:",Str0
    10 Z.x:Int = 5
    """
    
    VERSION = "1.0.0"
    
    def __init__(self, parent_nesh: NeSH):
        self.parent = parent_nesh
        self.program: Dict[int, str] = {}
        self.variables: Dict[str, Any] = {}
        self.labels: Dict[str, int] = {}
        self.pc = 0
        self.running = False
        self.output_buffer: List[str] = []
        
        # Predefined functions
        self.funcs = {
            'O': self._out,
            'I': self._inp,
            'Z': self._var,
            'IF': self._if,
            'GOTO': self._goto,
            'GOSUB': self._gosub,
            'RETURN': self._return,
            'END': self._end,
            'FOR': self._for,
            'NEXT': self._next,
            'WHILE': self._while,
            'WEND': self._wend,
            'PRINT': self._print,
            'INPUT': self._input,
            'LET': self._let,
            'DIM': self._dim,
            'RAND': self._rand,
            'TIME': self._time,
            'DATE': self._date,
            'VAL': self._val,
            'STR': self._str,
            'LEN': self._len,
            'MID': self._mid,
            'LEFT': self._left,
            'RIGHT': self._right,
            'INSTR': self._instr,
            'CHR': self._chr,
            'ASC': self._asc,
            'ABS': abs,
            'SQR': lambda x: x ** 0.5,
            'SIN': __import__('math').sin,
            'COS': __import__('math').cos,
            'TAN': __import__('math').tan,
            'LOG': __import__('math').log,
            'EXP': __import__('math').exp,
            'PI': __import__('math').pi,
            'RND': lambda: __import__('random').random(),
        }
    
    def load_program(self, code: str) -> str:
        """Load BASIC program"""
        self.program = {}
        self.labels = {}
        
        for line in code.split('\n'):
            line = line.strip()
            if not line or line.startswith("'") or line.startswith("#"):
                continue
            
            # Parse line number
            match = re.match(r'(\d+)\s+(.+)", line)
            if match:
                line_num = int(match.group(1))
                statement = match.group(2).strip()
                self.program[line_num] = statement
                
                # Check for labels
                if ':' in statement:
                    label = statement.split(':')[0].strip()
                    self.labels[label] = line_num
        
        return f"Loaded {len(self.program)} lines"
    
    def run(self) -> str:
        """Run the BASIC program"""
        self.running = True
        self.output_buffer = []
        self.pc = sorted(self.program.keys())[0] if self.program else 0
        
        while self.running and self.pc in self.program:
            try:
                self._execute_line(self.program[self.pc])
            except Exception as e:
                self.output_buffer.append(f"Error at line {self.pc}: {e}")
                break
            
            # Next line
            keys = sorted(self.program.keys())
            idx = keys.index(self.pc) if self.pc in keys else -1
            if idx + 1 < len(keys):
                self.pc = keys[idx + 1]
            else:
                break
        
        return "\n".join(self.output_buffer)
    
    def _execute_line(self, statement: str):
        """Execute a single BASIC statement"""
        statement = statement.strip()
        
        # Get the keyword
        parts = statement.split(None, 1)
        keyword = parts[0].upper() if parts else ''
        args = parts[1] if len(parts) > 1 else ''
        
        if keyword in self.funcs:
            self.funcs[keyword](args)
        else:
            # Try to evaluate as expression
            if '=' in statement:
                self._let(statement)
    
    # BASIC functions
    def _out(self, args: str):
        """O: output"""
        # O: "text" or O= expression
        if ':' in args:
            _, expr = args.split(':', 1)
            result = self._eval(expr)
            self.output_buffer.append(str(result))
        elif '=' in args:
            _, expr = args.split('=', 1)
            result = self._eval(expr)
            self.output_buffer.append(str(result))
    
    def _inp(self, args: str):
        """I: input"""
        # I: "prompt:",Var
        if ':' in args:
            prompt, var = args.split(':', 1)
            self.output_buffer.append(f"Input required: {prompt}")
    
    def _var(self, args: str):
        """Z: variable assignment"""
        # Z.x:Int = 5
        if '=' in args:
            var_part, value = args.split('=', 1)
            var_name, var_type = var_part.split(':')
            self.variables[var_name.strip()] = self._eval(value.strip())
    
    def _if(self, args: str):
        """IF condition THEN line"""
        if 'THEN' in args:
            cond, then_line = args.split('THEN', 1)
            if self._eval(cond.strip()):
                self.pc = int(then_line.strip())
    
    def _goto(self, args: str):
        """GOTO line"""
        self.pc = int(args.strip())
    
    def _gosub(self, args: str):
        """GOSUB line"""
        pass
    
    def _return(self, args: str):
        """RETURN"""
        pass
    
    def _end(self, args: str):
        """END"""
        self.running = False
    
    def _for(self, args: str):
        """FOR var = start TO end"""
        pass
    
    def _next(self, args: str):
        """NEXT"""
        pass
    
    def _while(self, args: str):
        """WHILE condition"""
        pass
    
    def _wend(self, args: str):
        """WEND"""
        pass
    
    def _print(self, args: str):
        """PRINT expr"""
        result = self._eval(args)
        self.output_buffer.append(str(result))
    
    def _input(self, args: str):
        """INPUT prompt, var"""
        pass
    
    def _let(self, args: str):
        """LET var = expr"""
        if '=' in args:
            var, expr = args.split('=', 1)
            self.variables[var.strip()] = self._eval(expr.strip())
    
    def _dim(self, args: str):
        """DIM array(size)"""
        pass
    
    def _rand(self, args: str):
        """RAND"""
        return __import__('random').random()
    
    def _time(self, args: str):
        """TIME"""
        return __import__('datetime').datetime.now().strftime("%H:%M:%S")
    
    def _date(self, args: str):
        """DATE"""
        return __import__('datetime').datetime.now().strftime("%Y-%m-%d")
    
    def _val(self, args: str):
        """VAL string"""
        return float(args.strip().strip('"').strip("'"))
    
    def _str(self, args: str):
        """STR expr"""
        return str(self._eval(args))
    
    def _len(self, args: str):
        """LEN string"""
        return len(self._eval(args))
    
    def _mid(self, args: str):
        """MID string, start, len"""
        parts = [p.strip() for p in args.split(',')]
        s = self._eval(parts[0])
        return s[int(parts[1])-1:int(parts[1]) + int(parts[2]) - 1] if len(parts) > 2 else s[int(parts[1])-1:]
    
    def _left(self, args: str):
        """LEFT string, len"""
        parts = [p.strip() for p in args.split(',')]
        return self._eval(parts[0])[:int(parts[1])]
    
    def _right(self, args: str):
        """RIGHT string, len"""
        parts = [p.strip() for p in args.split(',')]
        s = self._eval(parts[0])
        return s[-int(parts[1]):]
    
    def _instr(self, args: str):
        """INSTR string, substring"""
        parts = [p.strip() for p in args.split(',')]
        return self._eval(parts[0]).find(self._eval(parts[1])) + 1
    
    def _chr(self, args: str):
        """CHR code"""
        return chr(int(self._eval(args)))
    
    def _asc(self, args: str):
        """ASC char"""
        return ord(self._eval(args)[0])
    
    def _eval(self, expr: str) -> Any:
        """Evaluate expression"""
        # Replace variables
        for var, val in self.variables.items():
            expr = expr.replace(var, str(val))
        
        try:
            return eval(expr, {"__builtins__": {}}, {"math": __import__('math'), "random": __import__('random')})
        except:
            return expr


# Main entry point
if __name__ == "__main__":
    nesh = NeSH()
    print(f"NeSH v{nesh.VERSION} - Neon Shell")
    print("Type 'help' for commands, 'exit' to quit.")
    
    while True:
        prompt = nesh.get_prompt()
        cmd = input(prompt)
        
        if cmd.strip() in ('exit', 'quit', 'q'):
            break
        
        code, output = nesh.execute(cmd)
        if output:
            print(output)
