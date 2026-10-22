package com.example.phonedrive.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class CryptoTest {

    @Test
    fun testPbkdf2HashConsistency() {
        val password = "SuperSecretPassword123!"
        val salt = ByteArray(16) { it.toByte() }

        val spec1 = PBEKeySpec(password.toCharArray(), salt, 10_000, 256)
        val skf = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val hash1 = skf.generateSecret(spec1).encoded

        val spec2 = PBEKeySpec(password.toCharArray(), salt, 10_000, 256)
        val hash2 = skf.generateSecret(spec2).encoded

        assertEquals(32, hash1.size)
        assertTrue(hash1.contentEquals(hash2))

        // Compare against pure Mac implementation
        val mac = javax.crypto.Mac.getInstance("HmacSHA256")
        mac.init(javax.crypto.spec.SecretKeySpec(password.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val u1Input = salt + byteArrayOf(0, 0, 0, 1)
        var u = mac.doFinal(u1Input)
        val result = u.clone()
        for (i in 2..10_000) {
            u = mac.doFinal(u)
            for (j in result.indices) {
                result[j] = (result[j].toInt() xor u[j].toInt()).toByte()
            }
        }
        assertTrue("Pure HmacSHA256 PBKDF2 matches SecretKeyFactory", result.contentEquals(hash1))
    }

    @Test
    fun testDifferentPasswordsProduceDifferentHashes() {
        val salt = ByteArray(16) { it.toByte() }
        val skf = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")

        val hash1 = skf.generateSecret(PBEKeySpec("PasswordA".toCharArray(), salt, 10_000, 256)).encoded
        val hash2 = skf.generateSecret(PBEKeySpec("PasswordB".toCharArray(), salt, 10_000, 256)).encoded

        assertFalse(hash1.contentEquals(hash2))
    }

    @Test
    fun testTokenEntropy() {
        val random = SecureRandom()
        val tokenSet = mutableSetOf<String>()

        for (i in 0 until 100) {
            val bytes = ByteArray(32)
            random.nextBytes(bytes)
            val token = bytes.joinToString("") { "%02x".format(it) }
            tokenSet.add(token)
        }

        // All 100 random tokens must be unique
        assertEquals(100, tokenSet.size)
    }
}
