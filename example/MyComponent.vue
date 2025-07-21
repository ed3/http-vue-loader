<template>
    <div>
        <h2>{{ title }}</h2>
        <p>{{ username }}</p>
        <button @click="increment">Count: {{ count }}</button>
    </div>
</template>
<script>
export default {
    name: 'MyComponent',
    props: {
        username: {type: String, default: 'None'}
    },
    data() {
        return {
            title: 'Dynamic Component',
            count: 0
        };
    },
    methods: {
        increment() {
            this.count++;
        }
    },
    mounted() {
        console.log('MyComponent mounted!');
        console.log('Username:', this.username);
    }
};
</script>
<style scoped></style>