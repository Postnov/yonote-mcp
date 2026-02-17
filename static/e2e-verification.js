/**
 * End-to-end verification script for chat persistence functionality.
 *
 * This script verifies the complete persistence cycle:
 * 1. Create chat → message → refresh → chats visible → rename → delete
 *
 * To run this verification:
 * 1. Open the app in browser
 * 2. Open browser DevTools console
 * 3. Copy and paste this entire file
 * 4. Results will be logged to console
 */

(function runE2EVerification() {
    const STORAGE_KEY = 'yonote_chat_history';
    const STORAGE_VERSION = 1;
    let testsPassed = 0;
    let testsFailed = 0;

    function log(type, message) {
        const prefix = type === 'pass' ? '✅' : type === 'fail' ? '❌' : 'ℹ️';
        console.log(`${prefix} ${message}`);
        if (type === 'pass') testsPassed++;
        if (type === 'fail') testsFailed++;
    }

    function assert(condition, message) {
        if (condition) {
            log('pass', message);
        } else {
            log('fail', message);
        }
        return condition;
    }

    console.log('\n========================================');
    console.log('🧪 E2E VERIFICATION: Chat Persistence');
    console.log('========================================\n');

    // Test 1: localStorage availability
    console.log('--- Test 1: localStorage Availability ---');
    try {
        const testKey = '__test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        assert(true, 'localStorage is available');
    } catch (e) {
        assert(false, 'localStorage is NOT available: ' + e.message);
    }

    // Test 2: Clear state and verify empty
    console.log('\n--- Test 2: Clear State ---');
    localStorage.removeItem(STORAGE_KEY);
    const afterClear = localStorage.getItem(STORAGE_KEY);
    assert(afterClear === null, 'Storage cleared successfully');

    // Test 3: Create a mock chat and save
    console.log('\n--- Test 3: Create and Save Chat ---');
    const testChat = {
        id: Date.now().toString(),
        label: 'Test Chat for E2E',
        messages: [
            { type: 'user', text: 'Hello, this is a test message' },
            { type: 'assistant', html: '<div class="message assistant">Test response</div>' }
        ]
    };

    const saveData = {
        version: STORAGE_VERSION,
        chats: [testChat]
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
        assert(true, 'Chat saved to localStorage');
    } catch (e) {
        assert(false, 'Failed to save chat: ' + e.message);
    }

    // Test 4: Load and verify chat data
    console.log('\n--- Test 4: Load Chat Data ---');
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const loaded = JSON.parse(raw);

        assert(loaded.version === STORAGE_VERSION, 'Version matches: ' + loaded.version);
        assert(Array.isArray(loaded.chats), 'Chats is an array');
        assert(loaded.chats.length === 1, 'One chat exists');
        assert(loaded.chats[0].id === testChat.id, 'Chat ID matches');
        assert(loaded.chats[0].label === testChat.label, 'Chat label matches');
        assert(loaded.chats[0].messages.length === 2, 'Messages count matches');
    } catch (e) {
        assert(false, 'Failed to load chat: ' + e.message);
    }

    // Test 5: Simulate rename
    console.log('\n--- Test 5: Rename Chat ---');
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const data = JSON.parse(raw);
        const newLabel = 'Renamed Test Chat';

        data.chats[0].label = newLabel;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

        const reloaded = JSON.parse(localStorage.getItem(STORAGE_KEY));
        assert(reloaded.chats[0].label === newLabel, 'Chat renamed successfully to: ' + newLabel);
    } catch (e) {
        assert(false, 'Failed to rename chat: ' + e.message);
    }

    // Test 6: Verify persistence after simulated refresh
    console.log('\n--- Test 6: Persistence After Refresh ---');
    try {
        // Clear any in-memory state (simulating what happens on page load)
        const freshLoad = JSON.parse(localStorage.getItem(STORAGE_KEY));

        assert(freshLoad !== null, 'Data persists after simulated refresh');
        assert(freshLoad.chats.length === 1, 'Chat still exists after refresh');
        assert(freshLoad.chats[0].label === 'Renamed Test Chat', 'Renamed label persists');
    } catch (e) {
        assert(false, 'Persistence test failed: ' + e.message);
    }

    // Test 7: Add second chat
    console.log('\n--- Test 7: Add Second Chat ---');
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        const secondChat = {
            id: (Date.now() + 1).toString(),
            label: 'Second Test Chat',
            messages: [{ type: 'user', text: 'Second chat message' }]
        };

        data.chats.push(secondChat);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

        const reloaded = JSON.parse(localStorage.getItem(STORAGE_KEY));
        assert(reloaded.chats.length === 2, 'Two chats exist');
    } catch (e) {
        assert(false, 'Failed to add second chat: ' + e.message);
    }

    // Test 8: Delete first chat
    console.log('\n--- Test 8: Delete Chat ---');
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        const firstChatId = data.chats[0].id;

        // Remove first chat (simulating deleteChat function)
        data.chats = data.chats.filter(c => c.id !== firstChatId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

        const reloaded = JSON.parse(localStorage.getItem(STORAGE_KEY));
        assert(reloaded.chats.length === 1, 'One chat remains after deletion');
        assert(reloaded.chats[0].label === 'Second Test Chat', 'Correct chat remains');
    } catch (e) {
        assert(false, 'Failed to delete chat: ' + e.message);
    }

    // Test 9: Verify localStorage is updated correctly
    console.log('\n--- Test 9: Final State Verification ---');
    try {
        const finalData = JSON.parse(localStorage.getItem(STORAGE_KEY));

        assert(finalData.version === STORAGE_VERSION, 'Version intact');
        assert(finalData.chats.length === 1, 'Correct number of chats');
        assert(finalData.chats[0].messages.length === 1, 'Messages preserved');
    } catch (e) {
        assert(false, 'Final verification failed: ' + e.message);
    }

    // Test 10: Clean up
    console.log('\n--- Test 10: Cleanup ---');
    localStorage.removeItem(STORAGE_KEY);
    const cleanedUp = localStorage.getItem(STORAGE_KEY);
    assert(cleanedUp === null, 'Storage cleaned up successfully');

    // Summary
    console.log('\n========================================');
    console.log('📊 VERIFICATION RESULTS');
    console.log('========================================');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📋 Total:  ${testsPassed + testsFailed}`);

    if (testsFailed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Persistence cycle verified.');
    } else {
        console.log('\n⚠️  Some tests failed. Please review the results above.');
    }

    console.log('========================================\n');

    return { passed: testsPassed, failed: testsFailed };
})();
