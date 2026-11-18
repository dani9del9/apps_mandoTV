using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// Recibe comandos por stdin (uno por linea) y los convierte en raton/teclado reales con SendInput.
public static class MandoInput
{
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }

    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public InputUnion u; }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    static extern uint MapVirtualKey(uint uCode, uint uMapType);

    static readonly int SZ = Marshal.SizeOf(typeof(INPUT));

    static void Send(List<INPUT> l)
    {
        if (l.Count > 0) SendInput((uint)l.Count, l.ToArray(), SZ);
    }

    static INPUT M(uint flags, int dx, int dy, int data)
    {
        INPUT i = new INPUT();
        i.type = 0;
        i.u.mi.dx = dx;
        i.u.mi.dy = dy;
        i.u.mi.mouseData = unchecked((uint)data);
        i.u.mi.dwFlags = flags;
        return i;
    }

    static bool IsExtended(int vk)
    {
        return (vk >= 33 && vk <= 40) || vk == 44 || vk == 45 || vk == 46 || vk == 91 || vk == 92 || vk == 93;
    }

    static INPUT K(int vk, bool up)
    {
        INPUT i = new INPUT();
        i.type = 1;
        i.u.ki.wVk = (ushort)vk;
        i.u.ki.wScan = (ushort)MapVirtualKey((uint)vk, 0);
        uint f = 0;
        if (IsExtended(vk)) f |= 1;   // KEYEVENTF_EXTENDEDKEY
        if (up) f |= 2;               // KEYEVENTF_KEYUP
        i.u.ki.dwFlags = f;
        return i;
    }

    static INPUT U(char c, bool up)
    {
        INPUT i = new INPUT();
        i.type = 1;
        i.u.ki.wVk = 0;
        i.u.ki.wScan = c;
        i.u.ki.dwFlags = 4u | (up ? 2u : 0u); // KEYEVENTF_UNICODE
        return i;
    }

    static uint BtnFlag(string b, bool down)
    {
        switch (b)
        {
            case "r": return down ? 0x0008u : 0x0010u;
            case "m": return down ? 0x0020u : 0x0040u;
            default:  return down ? 0x0002u : 0x0004u;
        }
    }

    static void Handle(string line)
    {
        string[] p = line.Trim().Split(' ');
        List<INPUT> l = new List<INPUT>();
        switch (p[0])
        {
            case "m": l.Add(M(0x0001, int.Parse(p[1]), int.Parse(p[2]), 0)); break;
            case "c": l.Add(M(BtnFlag(p[1], true), 0, 0, 0)); l.Add(M(BtnFlag(p[1], false), 0, 0, 0)); break;
            case "d": l.Add(M(BtnFlag(p[1], true), 0, 0, 0)); break;
            case "u": l.Add(M(BtnFlag(p[1], false), 0, 0, 0)); break;
            case "s": l.Add(M(0x0800, 0, 0, int.Parse(p[1]))); break;
            case "h": l.Add(M(0x1000, 0, 0, int.Parse(p[1]))); break;
            case "kd": l.Add(K(int.Parse(p[1]), false)); break;
            case "ku": l.Add(K(int.Parse(p[1]), true)); break;
            case "k":
            {
                string[] parts = p[1].Split(',');
                int[] vks = new int[parts.Length];
                for (int j = 0; j < parts.Length; j++) vks[j] = int.Parse(parts[j]);
                int n = p.Length > 2 ? int.Parse(p[2]) : 1;
                for (int r = 0; r < n; r++)
                {
                    for (int j = 0; j < vks.Length; j++) l.Add(K(vks[j], false));
                    for (int j = vks.Length - 1; j >= 0; j--) l.Add(K(vks[j], true));
                }
                break;
            }
            case "t":
            {
                string s = p.Length > 1 ? Encoding.UTF8.GetString(Convert.FromBase64String(p[1])) : "";
                foreach (char c in s)
                {
                    if (c == '\r') continue;
                    if (c == '\n') { l.Add(K(13, false)); l.Add(K(13, true)); continue; }
                    if (c == '\t') { l.Add(K(9, false)); l.Add(K(9, true)); continue; }
                    l.Add(U(c, false)); l.Add(U(c, true));
                }
                break;
            }
        }
        Send(l);
    }

    public static void Loop()
    {
        Console.Out.WriteLine("READY");
        Console.Out.Flush();
        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            if (line.Length == 0) continue;
            try { Handle(line); }
            catch (Exception e) { Console.Error.WriteLine("Error: " + e.Message + " <- " + line); }
        }
    }
}
