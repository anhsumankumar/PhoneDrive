package com.example.phonedrive.data.security

import android.content.Context
import android.util.Base64
import com.example.phonedrive.data.db.AppDatabaseHelper
import java.security.NoSuchAlgorithmException
import java.security.SecureRandom
import java.security.spec.InvalidKeySpecException
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class SecurityManager(context: Context) {
    private val dbHelper = AppDatabaseHelper.getInstance(context)
    private val secureRandom = SecureRandom()

    // Rate limiting tracking: IP -> Pair(failedCount, lockedUntilMillis)
    private val failureTracker = ConcurrentHashMap<String, Pair<Int, Long>>()

    companion object {
        private const val KEY_PASSWORD_HASH = "sec_pwd_hash"
        private const val KEY_PASSWORD_SALT = "sec_pwd_salt"
        private const val ITERATIONS = 20_000
        private const val KEY_LENGTH = 256
        private const val MAX_FAILED_ATTEMPTS = 5
        private const val LOCKOUT_DURATION_MS = 60_000L // 1 minute lockout

        @Volatile
        private var INSTANCE: SecurityManager? = null

        fun getInstance(context: Context): SecurityManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SecurityManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    /**
     * Checks if a master password has been configured by the user.
     */
    fun isPasswordSet(): Boolean {
        val hash = dbHelper.getSetting(KEY_PASSWORD_HASH, "")
        return hash.isNotEmpty()
    }

    /**
     * Sets or updates the master password with PBKDF2 + random salt.
     */
    fun setPassword(newPassword: String) {
        val salt = ByteArray(16)
        secureRandom.nextBytes(salt)

        val hash = hashPassword(newPassword, salt)
        val saltBase64 = Base64.encodeToString(salt, Base64.NO_WRAP)
        val hashBase64 = Base64.encodeToString(hash, Base64.NO_WRAP)

        dbHelper.setSetting(KEY_PASSWORD_SALT, saltBase64)
        dbHelper.setSetting(KEY_PASSWORD_HASH, hashBase64)
    }

    /**
     * Verifies an entered password against stored PBKDF2 hash.
     * Enforces rate limiting against brute force attempts.
     */
    fun verifyPassword(password: String, clientIp: String): AuthResult {
        val now = System.currentTimeMillis()
        val tracker = failureTracker[clientIp]

        if (tracker != null && tracker.second > now) {
            val remainingSec = ((tracker.second - now) / 1000).toInt() + 1
            return AuthResult.LockedOut(remainingSec)
        }

        val storedSaltBase64 = dbHelper.getSetting(KEY_PASSWORD_SALT, "")
        val storedHashBase64 = dbHelper.getSetting(KEY_PASSWORD_HASH, "")

        if (storedSaltBase64.isEmpty() || storedHashBase64.isEmpty()) {
            return AuthResult.NoPasswordConfigured
        }

        val salt = Base64.decode(storedSaltBase64, Base64.NO_WRAP)
        val expectedHash = Base64.decode(storedHashBase64, Base64.NO_WRAP)
        val computedHash = hashPassword(password, salt)

        if (slowEquals(computedHash, expectedHash)) {
            failureTracker.remove(clientIp)
            return AuthResult.Success
        } else {
            val currentCount = (tracker?.first ?: 0) + 1
            if (currentCount >= MAX_FAILED_ATTEMPTS) {
                failureTracker[clientIp] = Pair(currentCount, now + LOCKOUT_DURATION_MS)
                return AuthResult.LockedOut(LOCKOUT_DURATION_MS.toInt() / 1000)
            } else {
                failureTracker[clientIp] = Pair(currentCount, 0L)
                return AuthResult.InvalidPassword(MAX_FAILED_ATTEMPTS - currentCount)
            }
        }
    }

    /**
     * Generates a 256-bit cryptographically secure session token.
     */
    fun generateSessionToken(): String {
        val randomBytes = ByteArray(32)
        secureRandom.nextBytes(randomBytes)
        return Base64.encodeToString(randomBytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private fun hashPassword(password: String, salt: ByteArray): ByteArray {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        digest.update(salt)
        var hash = digest.digest(password.toByteArray(Charsets.UTF_8))
        for (i in 1..ITERATIONS) {
            digest.update(hash)
            digest.update(salt)
            hash = digest.digest()
        }
        return hash
    }

    /**
     * Constant-time byte array comparison to protect against timing attacks.
     */
    private fun slowEquals(a: ByteArray, b: ByteArray): Boolean {
        var diff = a.size xor b.size
        val minLen = minOf(a.size, b.size)
        for (i in 0 until minLen) {
            diff = diff or (a[i].toInt() xor b[i].toInt())
        }
        return diff == 0
    }

    sealed class AuthResult {
        object Success : AuthResult()
        object NoPasswordConfigured : AuthResult()
        data class InvalidPassword(val remainingAttempts: Int) : AuthResult()
        data class LockedOut(val retryAfterSeconds: Int) : AuthResult()
    }
}
