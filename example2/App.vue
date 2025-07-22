<template>
<div>
<hey name="Ed" />
</div>
</template>
<script>
export default {
name: 'App',
components: {
'hey': 'url:./hey.vue'
}
};
</script>
<style scoped></style>