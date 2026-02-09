package com.block.goose.root

import com.topjohnwu.superuser.Shell
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Root helper for jailbroken/rooted Samsung devices.
 *
 * Tested with:
 *   - Samsung Tab S9+ (SM-X810, Android 15, Snapdragon, NinjaSU v0.9.4 + KernelSU)
 *   - Samsung S21 Ultra (Android 14, Snapdragon)
 *
 * Uses libsu which auto-detects KernelSU, NinjaSU, Magisk, and standard su.
 */
object RootHelper {

    /** Check if device has root access available. */
    val isRooted: Boolean
        get() = Shell.isAppGrantedRoot() == true

    /** Root method detected (KernelSU, Magisk, or generic su). */
    val rootMethod: String
        get() = when {
            Shell.isAppGrantedRoot() != true -> "none"
            Shell.cmd("which ksud").exec().isSuccess -> "KernelSU/NinjaSU"
            Shell.cmd("which magisk").exec().isSuccess -> "Magisk"
            else -> "su (generic)"
        }

    /** Device info string for diagnostics. */
    suspend fun getDeviceInfo(): String = withContext(Dispatchers.IO) {
        val model = shellExec("getprop ro.product.model")
        val android = shellExec("getprop ro.build.version.release")
        val sdk = shellExec("getprop ro.build.version.sdk")
        val soc = shellExec("getprop ro.soc.model")
        val ram = shellExec("cat /proc/meminfo | head -1")
        "Model: $model | Android $android (SDK $sdk) | SoC: $soc | $ram | Root: $rootMethod"
    }

    // ─── ADB WiFi ──────────────────────────────────────────────────

    /** Enable ADB over WiFi on port 5555 (no PC needed, root required). */
    suspend fun enableAdbWifi(port: Int = 5555): Result<String> = rootCommand(
        "setprop service.adb.tcp.port $port && stop adbd && start adbd",
        "ADB WiFi enabled on port $port"
    )

    /** Disable ADB over WiFi (revert to USB). */
    suspend fun disableAdbWifi(): Result<String> = rootCommand(
        "setprop service.adb.tcp.port -1 && stop adbd && start adbd",
        "ADB WiFi disabled"
    )

    /** Get device WiFi IP address. */
    suspend fun getWifiIp(): String = withContext(Dispatchers.IO) {
        shellExec("ip addr show wlan0 | grep 'inet ' | awk '{print \$2}' | cut -d/ -f1")
    }

    // ─── Silent APK Install ────────────────────────────────────────

    /** Install APK silently without user prompts (root required). */
    suspend fun silentInstall(apkPath: String): Result<String> = rootCommand(
        "pm install -r -d \"$apkPath\"",
        "APK installed: $apkPath"
    )

    /** Uninstall a package silently. */
    suspend fun silentUninstall(packageName: String): Result<String> = rootCommand(
        "pm uninstall $packageName",
        "Uninstalled: $packageName"
    )

    // ─── File System Access ────────────────────────────────────────

    /** Read any file on the device (root required). */
    suspend fun readFile(path: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val result = Shell.cmd("cat \"$path\"").exec()
            if (result.isSuccess) {
                Result.success(result.out.joinToString("\n"))
            } else {
                Result.failure(Exception(result.err.joinToString("\n")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Write content to any path on the device (root required). */
    suspend fun writeFile(path: String, content: String): Result<String> = rootCommand(
        "echo '$content' > \"$path\"",
        "Written to: $path"
    )

    /** List files at a root-protected path. */
    suspend fun listFiles(path: String): Result<List<String>> = withContext(Dispatchers.IO) {
        try {
            val result = Shell.cmd("ls -la \"$path\"").exec()
            if (result.isSuccess) {
                Result.success(result.out)
            } else {
                Result.failure(Exception(result.err.joinToString("\n")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ─── Screen Capture (for testing) ──────────────────────────────

    /** Take a screenshot and save to path (root allows any location). */
    suspend fun screenshot(outputPath: String): Result<String> = rootCommand(
        "screencap -p \"$outputPath\"",
        "Screenshot saved: $outputPath"
    )

    /** Record screen for N seconds (for automated testing). */
    suspend fun screenRecord(outputPath: String, durationSec: Int = 10): Result<String> = rootCommand(
        "screenrecord --time-limit $durationSec \"$outputPath\"",
        "Recording saved: $outputPath"
    )

    // ─── System Tuning ─────────────────────────────────────────────

    /** Set CPU governor for performance testing on Snapdragon. */
    suspend fun setCpuGovernor(governor: String = "performance"): Result<String> = rootCommand(
        "for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo $governor > \$cpu; done",
        "CPU governor set to: $governor"
    )

    /** Get current CPU frequencies. */
    suspend fun getCpuInfo(): String = withContext(Dispatchers.IO) {
        shellExec("cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null || echo 'N/A'")
    }

    /** Get GPU info (Adreno on Snapdragon). */
    suspend fun getGpuInfo(): String = withContext(Dispatchers.IO) {
        shellExec("cat /sys/class/kgsl/kgsl-3d0/gpu_model 2>/dev/null || echo 'N/A'")
    }

    // ─── Internals ─────────────────────────────────────────────────

    private suspend fun rootCommand(cmd: String, successMsg: String): Result<String> =
        withContext(Dispatchers.IO) {
            try {
                if (!isRooted) return@withContext Result.failure(Exception("No root access"))
                val result = Shell.cmd(cmd).exec()
                if (result.isSuccess) {
                    Result.success(successMsg)
                } else {
                    Result.failure(Exception(result.err.joinToString("\n").ifEmpty { "Command failed" }))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    private fun shellExec(cmd: String): String {
        val result = Shell.cmd(cmd).exec()
        return result.out.joinToString("\n").trim()
    }
}
